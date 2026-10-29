import { useState, useEffect, useCallback, useRef } from "react";
import badgeImgBigbrother from "@/assets/bigbrother.jpg";
import badgeImgCafe from "@/assets/cafe.png";
import badgeImgCommies from "@/assets/commies.jpg";
import { initializeApp } from "firebase/app";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, User
} from "firebase/auth";
import {
  getFirestore, collection, addDoc, getDocs, query, orderBy,
  serverTimestamp, doc, setDoc, getDoc, increment, updateDoc, arrayUnion, arrayRemove
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBv_ar9RlDchiq14xf-RMp420gttL2sCPE",
  authDomain: "analisis-literario-65346.firebaseapp.com",
  projectId: "analisis-literario-65346",
  storageBucket: "analisis-literario-65346.firebasestorage.app",
  messagingSenderId: "609852450783",
  appId: "1:609852450783:web:bc2763cec6a263d415466a",
};
const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

// ── Types ─────────────────────────────────────────────────────────────────────
type Difficulty = "easy" | "medium" | "hard";
interface Question {
  difficulty: Difficulty; mode: "critical" | "fragment" | "highlight" | "reorder" | "match" | "fallacy" | "verdict" | "agenda" | "stress" | "noise";
  concept: string; text: string; options: string[]; correct: number;
  feedback: string; feedbackAlt: string; fragment?: string; correctHighlight?: string;
  orderItems?: string[]; matchPairs?: { left: string; right: string }[]; noiseWords?: string[];
}
interface Flashcard { id: string; front: string; back: string; }
interface DebatePrompt { id: string; question: string; context: string; }
interface Book {
  id: string; title: string; author: string; year: number;
  genre: string; tagline: string; color: string; spine: string;
  badgeIcon: string; badgeName: string;
  questions: Question[]; flashcards: Flashcard[];
  debatePrompts: DebatePrompt[]; forumId: string;
}
interface Stats {
  points: number; streak: number; completedBooks: string[];
  completedBooksHard: string[]; lastActive: string;
  totalQuizzes: number; totalDebates: number; totalForumPosts: number;
  completedLevels: string[];
  bestDebateResponse?: { text: string; likes: number; bookTitle: string };
}
interface ForumPost {
  id: string; user: string; text: string; ts: number;
  upvotes: number; upvotedBy: string[]; parentId?: string;
  replies?: ForumPost[];
}
interface DebatePost {
  id: string; user: string; text: string; ts: number;
  likes: number; likedBy: string[]; authorId?: string;
}

const DEFAULT_STATS: Stats = {
  points: 0, streak: 0, completedBooks: [], completedBooksHard: [],
  lastActive: "", totalQuizzes: 0, totalDebates: 0, totalForumPosts: 0,
  completedLevels: [],
};

interface BookExperience { setting: string; role: string; description: string; mission: string; }
const BOOK_EXPERIENCES: Record<string, BookExperience> = {
  "1984": { setting:"Ministerio de la Verdad", role:"Inspector de archivos", description:"Una sociedad totalitaria altera el lenguaje, la memoria y hasta la intimidad para hacer imposible la disidencia.", mission:"Detecta contradicciones, propaganda y pruebas borradas antes de que el Partido reescriba el expediente." },
  granja: { setting:"Archivo de la Granja Animal", role:"Cronista de la rebelión", description:"Una revolución por la igualdad termina reproduciendo los abusos del régimen que prometía destruir.", mission:"Reconstruye cómo las consignas y los mandamientos cambian para proteger a quienes concentran el poder." },
  chocolate: { setting:"Cocina de la familia De la Garza", role:"Intérprete de memorias", description:"El amor, la tradición y la rebeldía se transmiten a través de recetas capaces de expresar lo que las palabras callan.", mission:"Lee cada emoción como evidencia y separa las normas familiares de los deseos de sus personajes." },
  espiritus: { setting:"Casa Trueba", role:"Archivero de generaciones", description:"Cuatro generaciones atraviesan conflictos familiares, desigualdad social, violencia política y memoria.", mission:"Conecta testimonios y silencios para establecer qué versión del pasado resiste al poder." },
  maus: { setting:"Archivo de testimonios", role:"Curador de memoria", description:"Un hijo reconstruye la supervivencia de su padre durante el Holocausto y el daño que continúa después.", mission:"Distingue memoria, trauma y representación sin reducir el testimonio a una cronología simple." },
  principito: { setting:"Observatorio de asteroides", role:"Cartógrafo de vínculos", description:"Un pequeño viajero examina el mundo adulto y descubre que cuidar, amar y mirar de verdad crean responsabilidad.", mission:"Descifra símbolos y decide qué enseñan los encuentros del principito sobre las relaciones humanas." },
  dorian: { setting:"Galería del retrato", role:"Perito moral", description:"Un joven conserva su belleza mientras un retrato registra la corrupción causada por sus decisiones.", mission:"Examina influencia, responsabilidad y apariencia para emitir un veredicto sobre la decadencia de Dorian." },
  fahrenheit: { setting:"Brigada de libros prohibidos", role:"Bombero disidente", description:"En una sociedad que quema libros y evita toda incomodidad, un bombero empieza a cuestionar su función.", mission:"Rescata ideas del fuego y reconoce cómo entretenimiento, censura y conformismo debilitan el pensamiento." },
  cien: { setting:"Archivo de Macondo", role:"Descifrador de manuscritos", description:"La familia Buendía repite amores, guerras y soledades mientras la historia de Macondo gira sobre sí misma.", mission:"Ordena ciclos, nombres y recuerdos antes de que el olvido borre una vez más lo sucedido." },
  mundofeliz: { setting:"Centro de Condicionamiento", role:"Auditor de estabilidad", description:"Una sociedad elimina el dolor mediante castas, consumo y placer, pero también sacrifica libertad y profundidad.", mission:"Evalúa si la felicidad programada justifica renunciar al arte, la verdad y el derecho a elegir." },
  narnia: { setting:"Consejo de Cair Paravel", role:"Guardián de la Magia Profunda", description:"Cuatro hermanos entran en un reino bajo un invierno eterno y participan en una historia de traición y redención.", mission:"Interpreta decisiones, símbolos y sacrificios para distinguir poder, gracia y responsabilidad." },
  frankenstein: { setting:"Tribunal de Ginebra", role:"Fiscal de responsabilidad científica", description:"Victor Frankenstein crea vida y abandona a su criatura, iniciando una cadena de aislamiento y venganza.", mission:"Contrasta testimonios y determina quién responde por las consecuencias de crear y abandonar." },
  tregua: { setting:"Archivo personal de Santomé", role:"Editor de diario íntimo", description:"Un viudo próximo a jubilarse encuentra un amor inesperado que interrumpe brevemente su vida rutinaria.", mission:"Lee lo que Santomé dice y lo que evita para evaluar si su transformación es genuina." },
};
function getBookExperience(book: Book): BookExperience {
  return BOOK_EXPERIENCES[book.id] ?? { setting:"Sala de lectura", role:"Detective de la lógica", description:book.tagline, mission:"Examina la evidencia y construye una interpretación razonada." };
}

function questionHint(q: Question): string {
  const hints: Record<Question["mode"], string> = {
    critical:`Busca qué opción explica el concepto «${q.concept}» y no solo repite una palabra de la pregunta.`,
    fragment:"Distingue lo que el fragmento demuestra de lo que parece razonable, pero no está respaldado por el texto.",
    highlight:"Busca la frase que aporta una prueba concreta; evita opiniones generales o simples conclusiones.",
    reorder:"Identifica primero el dato verificable, después la interpretación y por último la conclusión.",
    match:"Compara el significado preciso de cada concepto antes de conectarlo con una interpretación.",
    fallacy:"Pregunta si el argumento ataca a una persona, deforma una postura, iguala casos distintos o inventa una causa.",
    verdict:"Decide si hay evidencia suficiente y una conexión lógica entre las razones y la conclusión.",
    agenda:"Pregunta quién gana poder, legitimidad o recursos si el lector acepta el mensaje sin cuestionarlo.",
    stress:"Busca el dato que contradice directamente la premisa central, no uno que solo añada contexto.",
    noise:"Tacha únicamente palabras emocionales o valorativas. Conserva nombres, acciones y datos verificables.",
  };
  return hints[q.mode];
}

function selectQuestions(pool: Question[], n: number, diff?: Difficulty): (Question & { _idx: number })[] {
  const indexed = pool.map((q, i) => ({ ...q, _idx: i }));
  if (!diff) return [...indexed].sort(() => Math.random() - 0.5).slice(0, n);
  const primary = [...indexed.filter(q => q.difficulty === diff)].sort(() => Math.random() - 0.5);
  const others = [...indexed.filter(q => q.difficulty !== diff)].sort(() => Math.random() - 0.5);
  return [...primary, ...others].slice(0, n);
}

function shuffled<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function buildQuizQuestions(book: Book, difficulty: Difficulty): (Question & { _idx: number })[] {
  const target: Record<Difficulty, number> = { easy: 5, medium: 8, hard: 11 };
  const pool = book.questions.filter(q => q.difficulty === difficulty);
  const source = shuffled(pool);
  const sample = (index: number) => source[index % source.length];
  const evidenceSource = sample(0);
  const evidenceSentence = evidenceSource.feedback;
  const evidence: Question & { _idx: number } = {
    ...evidenceSource,
    _idx: 1000,
    mode: "highlight",
    concept: "Inspector de evidencia",
    text: difficulty === "hard"
      ? "Aísla la frase que funciona como evidencia decisiva y no como simple valoración."
      : "Selecciona la frase exacta que contiene la evidencia central.",
    fragment: `Una lectura superficial de ${book.title} se limita a resumir su argumento. ${evidenceSentence} Esta observación permite sostener una interpretación verificable del conflicto.`,
    options: [
      `Una lectura superficial de ${book.title} se limita a resumir su argumento.`,
      evidenceSentence,
      "Esta observación permite sostener una interpretación verificable del conflicto.",
    ],
    correctHighlight: evidenceSentence,
    correct: 1,
    feedback: "Identificaste la proposición que aporta evidencia textual a la inferencia.",
    feedbackAlt: "La evidencia debía ser una afirmación verificable sobre la obra, no una valoración general.",
  };

  const reasoning = sample(1);
  const orderItems = [
    `Premisa textual: ${reasoning.options[reasoning.correct]}.`,
    `Inferencia: ${reasoning.feedbackAlt}`,
    `Conclusión: ${reasoning.feedback}`,
  ];
  const reorder: Question & { _idx: number } = {
    difficulty,
    mode: "reorder",
    concept: "Arquitectura argumentativa",
    text: difficulty === "hard"
      ? "Reconstruye el argumento sin confundir evidencia, inferencia y conclusión."
      : "Ordena la premisa, la inferencia y la conclusión.",
    options: [],
    correct: 0,
    orderItems,
    feedback: "El argumento avanza de la evidencia a su interpretación y termina en la tesis.",
    feedbackAlt: "Revisa la función lógica de cada enunciado: primero evidencia, después inferencia y al final conclusión.",
    _idx: 1001,
  };

  const pairSources = [sample(2), sample(3), sample(4)];
  const pairs = pairSources.map(q => ({ left: q.concept, right: q.options[q.correct] }));
  const match: Question & { _idx: number } = {
    difficulty,
    mode: "match",
    concept: "Mapa de posturas",
    text: difficulty === "hard"
      ? "Relaciona cada núcleo conceptual con la interpretación que mejor conserva sus matices."
      : "Empareja cada concepto con su interpretación.",
    options: [],
    correct: 0,
    matchPairs: pairs,
    feedback: "Construiste un mapa conceptual consistente con las tensiones de la obra.",
    feedbackAlt: "Alguna relación reduce o desplaza el sentido del concepto. Contrasta cada postura con la evidencia.",
    _idx: 1002,
  };

  const fallacySource = sample(5);
  const fallacies = ["Ad Hominem", "Hombre de Paja", "Falsa Equivalencia", "Causa falsa"];
  const fallacy: Question & { _idx: number } = {
    difficulty,
    mode: "fallacy",
    concept: "Cartas de falacia",
    text: "Juega la carta que identifica el defecto del razonamiento.",
    fragment: `La interpretación de «${fallacySource.concept}» es incorrecta porque quienes la defienden claramente no entendieron ${book.title}.`,
    options: fallacies,
    correct: 0,
    feedback: "Es un Ad Hominem: desacredita a quienes sostienen la postura en vez de refutar sus razones.",
    feedbackAlt: "El argumento ataca la capacidad de los lectores, no la validez de la interpretación.",
    _idx: 1003,
  };

  const verdictSource = sample(6);
  const verdict: Question & { _idx: number } = {
    difficulty,
    mode:"verdict",
    concept:"Veredicto rápido",
    text:"Emite un veredicto: ¿el razonamiento se sostiene?",
    fragment:`Como «${verdictSource.concept}» aparece en ${book.title}, necesariamente es la causa de todos los conflictos de la obra.`,
    options:["Argumento válido","Falacia / opinión sin sustento"],
    correct:1,
    feedback:"Veredicto correcto: presencia no significa causalidad. La afirmación generaliza sin demostrar el vínculo.",
    feedbackAlt:"La frase parece segura, pero convierte una coincidencia temática en causa absoluta sin aportar evidencia.",
    _idx:1004,
  };
  const nostalgia: Question & { _idx: number } = {
    difficulty:"easy",
    mode:"fallacy",
    concept:"Sesgo y falacia",
    text:"Toca la carta que identifica el recurso usado para sostener la conclusión.",
    fragment:"«Los jóvenes ya no leen libros porque pasan todo el día en pantallas. En mis tiempos leíamos obras maestras y éramos más inteligentes».",
    options:["Sesgo de nostalgia","Ad Hominem","Hombre de Paja","Falsa Equivalencia"],
    correct:0,
    feedback:"El hablante idealiza su propio pasado y lo usa como prueba, sin datos que demuestren que su generación era más inteligente.",
    feedbackAlt:"La trampa consiste en confundir un recuerdo idealizado con evidencia sobre dos generaciones completas.",
    _idx:1005,
  };
  const agenda: Question & { _idx: number } = {
    difficulty,
    mode:"agenda",
    concept:"La Agenda Oculta",
    text:"¿Qué actor se beneficia más si esta versión se acepta como verdad?",
    fragment:`«El orden de ${getBookExperience(book).setting} solo puede conservarse si nadie cuestiona la versión oficial de los hechos».`,
    options:["La autoridad que controla el relato","La ciudadanía que exige pruebas","Quienes conservan versiones alternativas"],
    correct:0,
    feedback:"Detectaste al beneficiario: controlar la versión oficial protege a la autoridad de cualquier rendición de cuentas.",
    feedbackAlt:"La trampa era elegir al actor mencionado de forma más simpática. Sigue el poder: ¿quién evita ser cuestionado?",
    _idx:1006,
  };
  const stress: Question & { _idx: number } = {
    difficulty,
    mode:"stress",
    concept:"Prueba de Estrés",
    text:"Lanza el dato que más debilita la solidez del argumento.",
    fragment:`Argumento bajo prueba: «Como ${sample(0).concept.toLowerCase()} aparece repetidamente en ${book.title}, todos los personajes reaccionan de la misma manera».`,
    options:[
      "Un contraejemplo donde un personaje responde de forma opuesta",
      `La fecha de publicación de la obra: ${book.year}`,
      `Una descripción general del género ${book.genre.toLowerCase()}`,
    ],
    correct:0,
    feedback:"El contraejemplo rompe la generalización universal: basta una respuesta opuesta para demostrar que no todos actúan igual.",
    feedbackAlt:"Ese dato puede ser verdadero, pero no golpea la premisa «todos reaccionan igual». Era ruido contextual.",
    _idx:1007,
  };
  const noise: Question & { _idx: number } = {
    difficulty,
    mode:"noise",
    concept:"Filtro de Ruido",
    text:"Tacha las expresiones manipulativas y deja solo la información verificable.",
    fragment:`La evidentemente peligrosa autoridad impuso una norma el ${book.year}, provocando una intolerable y desastrosa reacción pública.`,
    options:[],
    correct:0,
    noiseWords:["evidentemente peligrosa","intolerable","desastrosa"],
    feedback:"Eliminaste las valoraciones emocionales. Ahora queda una afirmación que puede verificarse con evidencia.",
    feedbackAlt:"La trampa fue borrar información comprobable o conservar adjetivos que ya dictaban cómo debía sentirse el lector.",
    _idx:1008,
  };

  const advanced = difficulty === "easy"
    ? [nostalgia, verdict, noise]
    : difficulty === "hard"
      ? [evidence, reorder, match, fallacy, verdict, agenda, stress, noise]
      : [evidence, reorder, verdict, agenda, stress];
  const baseCount = target[difficulty] - advanced.length;
  const base = selectQuestions(pool, baseCount, difficulty);
  return shuffled([...base, ...advanced]);
}

// ── Books ─────────────────────────────────────────────────────────────────────
const BOOKS: Book[] = [
  {
    id:"1984", title:"1984", author:"George Orwell", year:1949,
    genre:"Distopía política", tagline:"El Gran Hermano te observa.",
    color:"#8B1A1A", spine:"#6B1212", badgeIcon:badgeImgBigbrother, badgeName:"Vigilante",
    questions:[
      {difficulty:"easy",mode:"critical",concept:"Personajes",text:"¿Quién es Winston Smith?",options:["El líder del Partido","Un empleado del Ministerio de la Verdad que guarda pensamientos rebeldes","El jefe de la Policía del Pensamiento","Un ciudadano de Eurasia"],correct:1,feedback:"Winston trabaja reescribiendo la historia para el Partido, aunque en secreto la cuestiona.",feedbackAlt:"Winston Smith es el protagonista: un empleado del Ministerio de la Verdad que internamente se rebela."},
      {difficulty:"easy",mode:"fragment",concept:"Lema del Partido",text:"Lee el fragmento. ¿Qué efecto busca el lema del Partido?",fragment:"LA GUERRA ES LA PAZ. LA LIBERTAD ES LA ESCLAVITUD. LA IGNORANCIA ES LA FUERZA.",options:["Inspirar con ideales positivos","Paralizar el pensamiento crítico mediante contradicciones aceptadas como verdad","Resumir honestamente la filosofía del gobierno","Advertir a los enemigos del Partido"],correct:1,feedback:"El lema usa contradicciones para que el ciudadano no pueda razonar en contra.",feedbackAlt:"El lema es un ejemplo de 'doblepensar': aceptar dos ideas opuestas como verdades simultáneas."},
      {difficulty:"easy",mode:"critical",concept:"Vigilancia",text:"¿Qué es una telepantalla y cuál es su función principal?",options:["Una televisión de entretenimiento","Un dispositivo bidireccional que transmite y vigila simultáneamente","Un sistema de comunicación solo entre miembros del Partido","Una herramienta para recibir órdenes del Gran Hermano"],correct:1,feedback:"La telepantalla es el instrumento central del control: no solo emite, también registra todo lo que ocurre ante ella.",feedbackAlt:"Su función es hacer que la vigilancia sea omnipresente."},
      {difficulty:"easy",mode:"critical",concept:"Diario",text:"¿Por qué es peligroso que Winston escriba un diario?",options:["Está prohibido por ser anticuado","Constituye un crimen del pensamiento que puede llevar a la vaporización","El papel es un lujo reservado al Partido","Podría revelar su identidad a Julia"],correct:1,feedback:"Escribir pensamientos propios es un crimen del pensamiento: la evidencia más peligrosa de deslealtad.",feedbackAlt:"El diario materializa los pensamientos rebeldes de Winston."},
      {difficulty:"medium",mode:"critical",concept:"Poder simbólico",text:"¿Por qué el Gran Hermano nunca aparece físicamente en la novela?",options:["Es una figura mítica: como idea no puede morir, como persona sí","Está administrando el Imperio desde otro país","Orwell quería reducir personajes","Fue eliminado antes de que comience la historia"],correct:0,feedback:"El Gran Hermano no necesita existir físicamente: su poder reside en ser un símbolo absoluto.",feedbackAlt:"Orwell lo construye como símbolo. El poder no está en un individuo sino en la idea misma."},
      {difficulty:"medium",mode:"fragment",concept:"Neolengua",text:"¿Cuál es el propósito real de la Neolengua?",fragment:"La finalidad de la Neolengua es limitar el alcance del pensamiento. Ortodoxia es inconsciencia.",options:["Hacer el idioma más eficiente","Destruir la posibilidad misma de pensar críticamente","Simplificar la comunicación","Crear un idioma universal"],correct:1,feedback:"La Neolengua no es simplificación: es aniquilación del pensamiento crítico.",feedbackAlt:"Destruir palabras es destruir ideas."},
      {difficulty:"medium",mode:"critical",concept:"Julia",text:"¿Qué tipo de rebelión representa Julia en contraste con Winston?",options:["Julia tiene una rebelión política más profunda","Julia se rebela de forma práctica y sensual, sin ambición política","Julia trabaja para derrocar al Partido","Julia y Winston tienen la misma rebelión"],correct:1,feedback:"Julia se rebela para vivir, no para cambiar el mundo.",feedbackAlt:"Winston busca significado político, Julia busca placer y libertad personal."},
      {difficulty:"hard",mode:"critical",concept:"Naturaleza del poder",text:"¿Qué distingue filosóficamente al Partido de otros totalitarismos según O'Brien?",options:["Usa tecnología más avanzada","Busca el poder puro y exige amor genuino, no solo obediencia","Permite más libertad económica","Tiene un enemigo externo real"],correct:1,feedback:"El Partido persigue solo el poder. Y no le basta la obediencia: necesita el amor genuino del súbdito.",feedbackAlt:"O'Brien explica que el Partido tortura para que Winston ame genuinamente al Gran Hermano."},
      {difficulty:"hard",mode:"highlight",concept:"Momento de quiebre",text:"Subraya la frase que captura el momento en que Winston pierde definitivamente su humanidad:",fragment:"Miró el retrato. Era impensable que pudiera ser vencido. Dos lágrimas le resbalaron por las mejillas. Pero ahora todo iba bien, la lucha había terminado. Había obtenido la victoria sobre sí mismo. Amaba al Gran Hermano.",correctHighlight:"Amaba al Gran Hermano",options:["Había obtenido la victoria sobre sí mismo","Amaba al Gran Hermano","la lucha había terminado","ahora todo iba bien"],correct:1,feedback:"Esa frase es el colapso total: no solo obedece, genuinamente ama a su opresor.",feedbackAlt:"'Victoria sobre sí mismo' es irónico: esa victoria es su destrucción como ser pensante."},
      {difficulty:"hard",mode:"critical",concept:"O'Brien y la traición",text:"¿Qué revela la traición de O'Brien sobre la naturaleza del poder?",options:["Que incluso los inteligentes pueden ser corruptos","Que el Partido infiltra hasta las esperanzas más íntimas de sus oponentes","Que Winston era demasiado ingenuo","Que la Hermandad nunca existió"],correct:1,feedback:"O'Brien encarna la trampa perfecta: el Partido seduce con la promesa de resistencia antes de destruirla.",feedbackAlt:"La traición demuestra que el Partido no solo vigila acciones, sino que controla activamente las esperanzas."},
      {difficulty:"easy",mode:"critical",concept:"Sala 101",text:"¿Qué es la Sala 101?",options:["La oficina de O'Brien","El lugar donde se guarda el archivo de la historia","La cámara de tortura donde se enfrenta a cada persona con su peor miedo","La sala de reuniones de la Hermandad"],correct:2,feedback:"La Sala 101 es el arma psicológica definitiva: no hay tortura universal sino el miedo específico de cada individuo.",feedbackAlt:"Para Winston era las ratas. El Partido sabe exactamente qué rompe a cada persona."},
      {difficulty:"medium",mode:"critical",concept:"Los proles",text:"¿Qué dice Winston sobre los proles y por qué importa su conclusión?",options:["Los proles son el enemigo del Partido y deben ser eliminados","Los proles son la única esperanza real de revolución, pero están demasiado adormecidos para actuar","Los proles son felices y no necesitan ser liberados","Los proles tienen acceso a más libertades que los miembros del Partido"],correct:1,feedback:"Winston escribe 'Si hay esperanza, está en los proles' — pero también reconoce que esa esperanza es casi imposible de movilizar.",feedbackAlt:"La ironía es que la mayoría de la población tiene el poder pero ha sido vaciada de la voluntad de usarlo."},
      {difficulty:"medium",mode:"critical",concept:"El libro de Goldstein",text:"¿Qué función cumple el libro de Goldstein en la novela?",options:["Explica cómo destruir el Partido con instrucciones prácticas","Describe cómo funciona el sistema del Partido desde adentro y revela que el Partido lo fabricó para atrapar disidentes","Es el verdadero manifiesto de la Hermandad","Es un libro de historia que Winston rescata"],correct:1,feedback:"El libro es una trampa: O'Brien lo escribió para identificar y destruir a quienes buscan la resistencia.",feedbackAlt:"El libro que promete la verdad es en realidad el anzuelo más sofisticado del Partido."},
      {difficulty:"medium",mode:"critical",concept:"El lenguaje y el poder",text:"¿Por qué Syme desaparece a pesar de ser un leal del Partido?",options:["Porque tenía contacto con Goldstein","Porque era demasiado inteligente y analítico — el Partido no puede confiar en quien piensa demasiado bien","Porque su trabajo de compilar la Neolengua terminó","Porque Winston lo delató"],correct:1,feedback:"Syme era demasiado lúcido. Entendía los mecanismos del Partido con demasiada claridad.",feedbackAlt:"Winston lo prevé: alguien tan inteligente inevitablemente pensa demasiado y eso es peligroso."},
      {difficulty:"medium",mode:"fragment",concept:"La reescritura de la historia",text:"¿Qué revela esta cita sobre la relación entre historia y poder?",fragment:"Quien controla el pasado controla el futuro. Quien controla el presente controla el pasado.",options:["Que la historia es solo perspectiva","Que el control del registro histórico es la forma más profunda de control político","Que el Partido es honesto sobre su dominio","Que el futuro determina el pasado"],correct:1,feedback:"El Ministerio de la Verdad reescribe el pasado continuamente. Sin pasado fijo, no hay verdad posible.",feedbackAlt:"Es el principio filosófico central del poder total: controlar lo que fue."},
      {difficulty:"hard",mode:"critical",concept:"La tortura como amor",text:"¿Por qué O'Brien tortura a Winston con el objetivo de que lo ame genuinamente?",options:["Por sadismo personal","Porque el Partido necesita control total: la obediencia exterior no basta, necesita que el súbdito ame su propia opresión","Para probar que su técnica funciona","Porque Winston es un caso de estudio especial"],correct:1,feedback:"El Partido necesita convertir el interior del individuo, no solo su comportamiento. La obediencia sin amor es insuficiente.",feedbackAlt:"O'Brien explica: no nos basta destruirte — debemos transformarte."},
      {difficulty:"hard",mode:"critical",concept:"El año 1984",text:"¿Por qué Orwell eligió '1984' como título?",options:["Era el año en que planeaba terminar el libro","Invirtió los dígitos de 1948, el año en que lo escribió, para señalar que el futuro distópico ya estaba presente","Es una referencia a una fecha histórica específica","Fue una elección arbitraria de su editor"],correct:1,feedback:"1948 invertido es 1984. Orwell advirtió que el totalitarismo no era solo un futuro posible sino una tendencia ya visible.",feedbackAlt:"El gesto de invertir el año dice: esto ya está pasando, miren a su alrededor."},
      {difficulty:"hard",mode:"critical",concept:"La guerra permanente",text:"¿Cuál es la función real de la guerra perpetua entre Oceanía, Eurasia y Estasia?",options:["Expandir los territorios del Partido","Mantener la economía en movimiento y justificar la escasez perpetua que mantiene a la población controlada","Proteger a los ciudadanos de invasiones reales","Dar empleo a los miembros menos calificados del Partido"],correct:1,feedback:"La guerra no se gana porque no debe ganarse. La escasez permanente y el miedo son los instrumentos del control social.",feedbackAlt:"Una sociedad en guerra permanente no puede cuestionar al gobierno que dice protegerla."},
      {difficulty:"hard",mode:"highlight",concept:"El poder puro",text:"¿Qué revela O'Brien sobre la naturaleza del Partido en este fragmento?",fragment:"El Partido busca el poder en sí mismo. No como medio para un fin, sino como fin en sí mismo. ¿Entiendes eso? El poder no es el medio: el poder es el objetivo.",correctHighlight:"El poder no es el medio: el poder es el objetivo",options:["El Partido busca el poder en sí mismo","El poder no es el medio: el poder es el objetivo","No como medio para un fin","sino como fin en sí mismo"],correct:1,feedback:"Esta es la diferencia entre el Partido y cualquier otro régimen: no usa el poder para algo, el poder ES el objetivo.",feedbackAlt:"Los regímenes anteriores mentían sobre sus motivos. El Partido es brutalmente honesto: dominar por dominar."},
      {difficulty:"hard",mode:"critical",concept:"La paradoja de la libertad",text:"¿Por qué el Partido elimina el pensamiento libre en lugar de simplemente controlarlo?",options:["Porque el control parcial es técnicamente imposible","Porque el pensamiento libre, por más pequeño que sea, siempre genera el germen de la resistencia — el Partido entendió que el control total o no existe","Por razones económicas de eficiencia","Porque los ciudadanos pidieron esa eliminación"],correct:1,feedback:"El Partido no puede permitir ni un solo pensamiento libre porque ese pensamiento puede crecer. La lógica del totalitarismo es la totalidad.",feedbackAlt:"O'Brien lo explica: no hay tolerancia posible, no hay excepciones."},
      {difficulty:"hard",mode:"critical",concept:"El diario como acto",text:"¿Cuál es el primer acto de rebelión de Winston y qué lo hace tan significativo?",options:["Comenzar a enamorarse de Julia","Escribir en el diario: materializar pensamientos propios en papel es el primer acto de existencia separada del Partido","Conocer a O'Brien","Comprar la habitación sobre la tienda de Mr. Charrington"],correct:1,feedback:"Antes de actuar, Winston debe afirmar que existe como individuo separado del Partido — el diario es esa afirmación.",feedbackAlt:"'Escrito: 4 de abril de 1984. Hoy estoy seguro.' Escribir el año es afirmar que hay un presente real."},
      {difficulty:"hard",mode:"critical",concept:"Winston como símbolo",text:"¿Por qué la derrota de Winston es literariamente necesaria para el mensaje de Orwell?",options:["Orwell quería un final pesimista por temperamento","La derrota total demuestra que el sistema funciona perfectamente y que no hay salida individual: solo la resistencia colectiva podría cambiar algo","Winston era demasiado débil como héroe","Orwell no tenía tiempo para escribir un final diferente"],correct:1,feedback:"Si Winston escapara, el libro sería una aventura. Su derrota total es la advertencia: ningún individuo puede resistir solo.",feedbackAlt:"El fin de Winston es una advertencia política, no una elección estética."},
    ],
    flashcards:[
      {id:"fc1",front:"¿Qué significa 'doblepensar'?",back:"Sostener dos creencias contradictorias simultáneamente y aceptar ambas como verdaderas."},
      {id:"fc2",front:"¿Cuál es el lema del Partido?",back:"Guerra es Paz. Libertad es Esclavitud. Ignorancia es Fuerza."},
      {id:"fc3",front:"¿Qué representa Julia en contraste con Winston?",back:"Rebelión práctica y sensual vs. rebelión intelectual y política."},
      {id:"fc4",front:"¿Qué es la Neolengua?",back:"El idioma oficial diseñado para hacer imposible el pensamiento crítico."},
    ],
    debatePrompts:[{id:"1984-d1",question:"¿Winston Smith es un héroe o una víctima del sistema?",context:"Al final Winston ama al Gran Hermano. ¿Eso anula todo lo que hizo antes o lo vuelve más trágico?"}],
    forumId:"1984-forum"
  },
  {
    id:"granja", title:"Rebelión en la granja", author:"George Orwell", year:1945,
    genre:"Fábula política", tagline:"Todos son iguales. Algunos más que otros.",
    color:"#2D5A1B", spine:"#1E3D12", badgeIcon:badgeImgCommies, badgeName:"Camarada",
    questions:[
      {difficulty:"easy",mode:"critical",concept:"Personajes",text:"¿Quién toma el control de la granja después de expulsar a Snowball?",options:["Boxer","Napoleón","Squealer","El Viejo Mayor"],correct:1,feedback:"Napoleón usa perros amaestrados para expulsar a Snowball y se convierte en el dictador.",feedbackAlt:"Napoleón representa a Stalin."},
      {difficulty:"easy",mode:"critical",concept:"El Viejo Mayor",text:"¿Qué papel cumple El Viejo Mayor en la novela?",options:["Es el primer dictador de la granja","Inspira la rebelión con su discurso sobre la igualdad animal antes de morir","Es el cerdo que inventa los Siete Mandamientos","Es el líder de los perros guardianes"],correct:1,feedback:"El Viejo Mayor es Karl Marx y Lenin: la figura revolucionaria fundadora cuya visión es traicionada.",feedbackAlt:"Su muerte antes de la revolución es simbólica."},
      {difficulty:"easy",mode:"fragment",concept:"Igualdad corrompida",text:"¿Qué revela este mandamiento modificado?",fragment:"TODOS LOS ANIMALES SON IGUALES PERO ALGUNOS ANIMALES SON MÁS IGUALES QUE OTROS",options:["Que el sistema evolucionó hacia algo más justo","Que los cerdos corrompieron el principio original de igualdad","Que los animales votaron por cambiar las reglas","Que el mandamiento nunca fue tomado en serio"],correct:1,feedback:"La corrupción del mandamiento revela que los cerdos traicionaron la revolución desde adentro.",feedbackAlt:"El lenguaje se pervierte para justificar la desigualdad como si fuera igualdad."},
      {difficulty:"medium",mode:"critical",concept:"Corrupción del poder",text:"¿Por qué los cerdos caminan en dos patas al final?",options:["Para mostrar superación evolutiva","Para simbolizar que adoptaron las características que combatían","Para crear una escena cómica","Para mostrar que son los más inteligentes"],correct:1,feedback:"Los animales ya no pueden distinguir cerdos de humanos.",feedbackAlt:"La revolución no transformó el sistema, solo cambió quién lo operaba."},
      {difficulty:"medium",mode:"critical",concept:"Boxer",text:"¿Qué representa el destino de Boxer?",options:["Que el esfuerzo siempre es recompensado","Que la clase trabajadora es traicionada y explotada por quienes dice servir","Que la lealtad al Estado es la virtud más alta","Que los animales no son suficientemente inteligentes"],correct:1,feedback:"Boxer trabaja hasta colapsar y es vendido al matadero.",feedbackAlt:"El cerdo más fuerte y más leal termina siendo mercancía."},
      {difficulty:"medium",mode:"fragment",concept:"Propaganda",text:"¿Qué técnica de manipulación usa Squealer?",fragment:"—Camaradas, nosotros los cerdos hacemos esto en un espíritu de sacrificio. La leche y las manzanas (esto ha sido probado por la Ciencia) contienen sustancias necesarias para el bienestar de un cerdo.",options:["Apelar a la ciencia falsa y presentar el privilegio como sacrificio","Usar amenazas directas","Ofrecer recompensas","Demostrar superioridad física"],correct:0,feedback:"Squealer invierte la realidad: los cerdos no roban, 'se sacrifican'.",feedbackAlt:"La apelación a 'la Ciencia' añade autoridad falsa."},
      {difficulty:"hard",mode:"critical",concept:"Imagen final",text:"¿Qué demuestra que los animales no puedan distinguir cerdos de humanos?",options:["El éxito evolutivo de los cerdos","Que la corrupción fue tan completa que el régimen resultante es idéntico al derrocado","Que los humanos aceptaron a los cerdos como iguales","Que la memoria de los animales se deterioró"],correct:1,feedback:"La revolución no transformó el sistema. Los nuevos gobernantes reproducen exactamente los métodos de los viejos.",feedbackAlt:"El poder corrompe independientemente de quién lo ejerza."},
      {difficulty:"hard",mode:"highlight",concept:"Lealtad ciega",text:"Subraya la frase que mejor muestra cómo la lealtad sin pensamiento crítico se vuelve parte del problema:",fragment:"Boxer no podía pensar mucho más allá de este punto, pero sentía que Napoleón siempre tenía razón. Y Boxer adoptó como lema personal: 'El camarada Napoleón siempre tiene razón'.",correctHighlight:"El camarada Napoleón siempre tiene razón",options:["Trabajaré más duro","El camarada Napoleón siempre tiene razón","Boxer no podía pensar mucho más allá","sentía que Napoleón siempre tenía razón"],correct:1,feedback:"Boxer se convierte en cómplice involuntario: su virtud sin pensamiento crítico alimenta la dictadura.",feedbackAlt:"La virtud sin crítica puede ser peligrosa."},
      {difficulty:"hard",mode:"critical",concept:"La alegoría",text:"¿A qué evento histórico alude directamente la expulsión de Snowball por Napoleón?",options:["A la Primera Guerra Mundial","A la expulsión de Trotsky por Stalin de la Unión Soviética","A la Revolución Francesa","Al ascenso del nazismo en Alemania"],correct:1,feedback:"Snowball es León Trotsky y Napoleón es Stalin. Orwell narra el proceso histórico real con precisión a través de la alegoría.",feedbackAlt:"La novela es una crítica directa al estalinismo."},
      {difficulty:"easy",mode:"critical",concept:"Los perros",text:"¿Para qué usa Napoleón a los perros que crió desde cachorros?",options:["Para cazar comida para todos los animales","Para intimidar, expulsar y ejecutar a cualquier opositor","Para proteger la granja de los humanos","Para simbolizar la nobleza del régimen"],correct:1,feedback:"Los perros son la policía secreta de Napoleón: herramienta de terror para mantener el control.",feedbackAlt:"Así como Stalin creó la NKVD, Napoleón cría su propia fuerza represiva desde el principio."},
      {difficulty:"easy",mode:"critical",concept:"El molino",text:"¿Qué representa el molino de viento y por qué se sigue construyendo?",options:["Es un proyecto económico genuinamente útil","Se convierte en símbolo de promesas vacías que mantiene ocupados a los animales mientras el poder se consolida","Es el logro más importante de la revolución","Fue idea de Snowball y los animales lo respetan"],correct:1,feedback:"El molino es la zanahoria perpetua: cada vez que se destruye, se reconstruye para dar a los animales una esperanza que nunca se cumple.",feedbackAlt:"Los grandes proyectos imposibles son instrumentos de control en manos de los demagogos."},
      {difficulty:"medium",mode:"critical",concept:"Moses el cuervo",text:"¿Qué representa Moses el cuervo y su historia de 'Sugarcandy Mountain'?",options:["La fe religiosa que el Viejo Mayor quería preservar","La religión como instrumento de control: promesas de un paraíso futuro que justifican el sufrimiento presente","Una crítica al capitalismo","La esperanza auténtica de los animales"],correct:1,feedback:"Moses representa la religión como opio del pueblo: su cuento de Sugarcandy Mountain mantiene a los animales resignados.",feedbackAlt:"Orwell (marxista) critica cómo la promesa del más allá desvía la atención de las injusticias del presente."},
      {difficulty:"medium",mode:"critical",concept:"Las ovejas",text:"¿Qué función cumplen las ovejas en la novela?",options:["Representan la resistencia pasiva","Representan a las masas irreflexivas que repiten consignas sin entenderlas, imposibilitando el debate crítico","Son el símbolo de la pureza revolucionaria","Son el grupo más oprimido del régimen"],correct:1,feedback:"'¡Cuatro patas bueno, dos patas malo!' es el canto de las ovejas que interrumpe cualquier discurso crítico.",feedbackAlt:"Las masas que repiten consignas son el escudo más efectivo del poder."},
      {difficulty:"medium",mode:"fragment",concept:"La historia reescrita",text:"¿Qué revela esta escena sobre cómo el poder controla la memoria?",fragment:"—¿Os acordáis que dos semanas antes de que Snowball fuera expulsado, ordenó que atacarais al camarada Napoleón? —Era nuestro enemigo desde el principio —dijo Squealer—. Los documentos lo prueban.",options:["Que Squealer tiene acceso a archivos reales","Que el pasado se reescribe para justificar el presente: la historia se fabrica según la conveniencia del poder","Que los animales tienen mala memoria","Que Snowball realmente era un traidor"],correct:1,feedback:"El pasado se puede inventar. 'Los documentos lo prueban' cuando los documentos los controla el poder.",feedbackAlt:"Este mecanismo es idéntico al del Ministerio de la Verdad en 1984."},
      {difficulty:"medium",mode:"critical",concept:"Benjamin el burro",text:"¿Por qué Benjamin el burro es el personaje más trágico de la novela?",options:["Porque trabaja más que nadie y no recibe reconocimiento","Porque lo sabe todo, entiende exactamente lo que ocurre, pero no hace nada — su cinismo lo hace cómplice","Porque es el único animal que muere en la novela","Porque fue el más cercano al Viejo Mayor"],correct:1,feedback:"Benjamin tiene la inteligencia para resistir pero elige el cinismo pasivo. Su inacción es una forma de colaboración.",feedbackAlt:"Orwell critica también al intelectual que 'lo ve todo' pero no actúa."},
      {difficulty:"hard",mode:"critical",concept:"El lenguaje como control",text:"¿Cómo usa Squealer el lenguaje para revertir la memoria colectiva?",options:["Con amenazas directas","Con falsas estadísticas y apelaciones a la ciencia para convencer de que el presente siempre fue mejor que el pasado","Con magia","Con promesas concretas de mejoras futuras"],correct:1,feedback:"Squealer fabrica estadísticas, invoca 'la ciencia' y usa el miedo a Jones para justificar cualquier cambio en las reglas.",feedbackAlt:"La propaganda no necesita ser creíble, solo necesita ser repetida con suficiente autoridad."},
      {difficulty:"hard",mode:"highlight",concept:"Los Mandamientos",text:"Subraya la frase que mejor demuestra cómo el lenguaje puede pervertir una idea justa:",fragment:"Originalmente estaba escrito: 'Ningún animal matará a otro animal'. Ahora decía: 'Ningún animal matará a otro animal sin motivo'.",correctHighlight:"sin motivo",options:["Ningún animal matará a otro animal","sin motivo","Originalmente estaba escrito","Ahora decía"],correct:1,feedback:"Dos palabras añadidas convierten una prohibición absoluta en una permisión con coartada.",feedbackAlt:"El 'sin motivo' puede justificar cualquier ejecución si el poder decide cuál es el motivo."},
      {difficulty:"hard",mode:"critical",concept:"Animalism vs. comunismo",text:"¿Por qué la novela no es solo sobre el comunismo soviético sino sobre todas las revoluciones?",options:["Porque Orwell era anticomunista en general","Porque demuestra que toda revolución corre el riesgo de ser capturada por quienes la lideran y convertida en un nuevo sistema de explotación","Porque la historia de los animales es universal","Porque critica la democracia también"],correct:1,feedback:"La tesis de Orwell es universal: el poder corrompe independientemente de la ideología inicial.",feedbackAlt:"La revolución francesa, la soviética, la cubana — todas tienen su 'Napoleón'. Ese es el punto."},
      {difficulty:"hard",mode:"critical",concept:"El liderazgo carismático",text:"¿Por qué Squealer es más peligroso que Napoleón para el mantenimiento del régimen?",options:["Porque Squealer tiene más poder físico","Porque Napoleón ejecuta el poder pero Squealer justifica, convence y reescribe la realidad — sin él, el poder desnudo de Napoleón no podría durar","Son igualmente peligrosos","Porque Squealer tiene acceso a toda la información"],correct:1,feedback:"La violencia puede resistirse pero la propaganda que hace amar la violencia es más difícil de combatir.",feedbackAlt:"Todo régimen autoritario tiene su Squealer: el propagandista que hace que las víctimas defiendan a sus opresores."},
      {difficulty:"hard",mode:"critical",concept:"El poder del lenguaje",text:"¿Cómo usa Orwell el lenguaje mismo en la novela para demostrar su tesis sobre el poder?",options:["Con vocabulario técnico deliberadamente difícil","Usando un lenguaje claro y preciso en los Siete Mandamientos que luego se degrada en el mismo texto — el lector ve el deterioro en tiempo real","Con lenguaje poético que contrasta con el contenido político","Sin ninguna estrategia lingüística particular"],correct:1,feedback:"Los Mandamientos originales son claros. Su degradación progresiva se produce ante los ojos del lector.",feedbackAlt:"Orwell muestra que el lenguaje no es solo descripción: es el campo de batalla del poder."},
      {difficulty:"hard",mode:"critical",concept:"Animalism vs. marxismo",text:"¿Cuál es la diferencia entre el Animalismo original del Viejo Mayor y el sistema final de Napoleón?",options:["No hay diferencia, son idénticos","El Animalismo prometía igualdad y fin de la explotación; el sistema de Napoleón reproduce exactamente la misma explotación con nuevos dueños","El Animalismo era menos violento","Napoleón mejoró el Animalismo haciéndolo más práctico"],correct:1,feedback:"La ideología original es traicionada desde el primer momento de la toma del poder.",feedbackAlt:"Este es el argumento central de Orwell: el problema no es la ideología inicial sino la naturaleza del poder."},
      {difficulty:"hard",mode:"critical",concept:"El final y los humanos",text:"¿Qué sugiere que los animales mirando por la ventana ya no distingan entre cerdos y humanos?",options:["Que los animales necesitan mejores lentes","Que la revolución fue un completo fracaso que solo cambió de amos","Que los cerdos se han vuelto biológicamente humanos","Que el futuro será más igualitario"],correct:1,feedback:"El círculo se cierra: los oprimidos se convirtieron en idénticos a sus opresores. La revolución reprodujo el sistema.",feedbackAlt:"Orwell nos pide que veamos: si no hay diferencia, entonces ¿para qué fue la revolución?"},
    ],
    flashcards:[
      {id:"fc1",front:"¿Qué representan los cerdos?",back:"La clase dirigente comunista soviética (Stalin y los bolcheviques)."},
      {id:"fc2",front:"¿Qué le pasa a Boxer?",back:"Trabaja hasta colapsar y es vendido al matadero. Napoleón miente diciendo que murió en el hospital."},
      {id:"fc3",front:"¿Qué son los Siete Mandamientos?",back:"Las reglas de la revolución que los cerdos van modificando hasta dejar solo una contradictoria."},
      {id:"fc4",front:"¿Qué representa Snowball?",back:"León Trotsky: el revolucionario idealista expulsado por el líder que se vuelve dictador."},
    ],
    debatePrompts:[{id:"granja-d1",question:"¿Boxer era virtuoso o solo ingenuo?",context:"Trabaja hasta morir repitiendo 'Napoleón siempre tiene razón'. ¿Su lealtad es admirable o parte del problema?"}],
    forumId:"granja-forum"
  },
  {
    id:"chocolate", title:"Como agua para chocolate", author:"Laura Esquivel", year:1989,
    genre:"Realismo mágico", tagline:"Las emociones se sirven a la mesa.",
    color:"#C87941", spine:"#9B5E30", badgeIcon:badgeImgCafe, badgeName:"Cocinera",
    questions:[
      {difficulty:"easy",mode:"critical",concept:"Conflicto central",text:"¿Por qué Tita no puede casarse con Pedro al inicio?",options:["Pedro no la ama","La tradición obliga a la hija menor a cuidar a la madre hasta su muerte","Tita está comprometida con otra persona","Pedro es demasiado pobre"],correct:1,feedback:"La tradición condena a Tita a una vida de servidumbre y le niega el amor.",feedbackAlt:"La novela critica cómo las tradiciones familiares pueden convertirse en prisiones."},
      {difficulty:"easy",mode:"fragment",concept:"Realismo mágico",text:"¿Qué recurso literario usa Esquivel?",fragment:"Dicen que Tita era tan sensible que desde que estaba en el vientre de su madre lloraba cuando ésta picaba cebolla. Un día los sollozos fueron tan fuertes que provocaron un parto prematuro.",options:["Hipérbole realista","Realismo mágico: los sentimientos tienen efectos físicos reales","Descripción médica precisa","Metáfora sobre la sensibilidad femenina"],correct:1,feedback:"El realismo mágico hace que las emociones tengan efectos físicos literales.",feedbackAlt:"Desde su nacimiento, Tita tiene una conexión mágica con sus emociones."},
      {difficulty:"easy",mode:"critical",concept:"Nacha",text:"¿Qué papel cumple Nacha en la vida de Tita?",options:["Es la antagonista que refuerza las reglas de Mamá Elena","Es la figura materna real de Tita, quien la cría en la cocina con amor","Es la hermana mayor que hereda el amor de Pedro","Es un personaje decorativo"],correct:1,feedback:"Nacha es la madre verdadera de Tita: la cría, le enseña a cocinar y le transmite el amor que Mamá Elena nunca le dio.",feedbackAlt:"La relación Tita-Nacha es la más afectiva de la novela."},
      {difficulty:"medium",mode:"critical",concept:"Simbolismo de la cocina",text:"¿Qué representa la cocina para Tita?",options:["Una cárcel sin escapatoria","Su único espacio de libertad y expresión dentro de la opresión","Un lugar de trabajo sin significado especial","El símbolo del fracaso de sus sueños"],correct:1,feedback:"La cocina es la paradoja central: el espacio de su esclavitud se convierte en su único poder real.",feedbackAlt:"Esquivel transforma la cocina de jaula en territorio de resistencia."},
      {difficulty:"medium",mode:"critical",concept:"Mamá Elena",text:"¿Qué función narrativa cumple Mamá Elena como antagonista?",options:["Representa la maldad pura sin motivación","Encarna el patriarcado y las tradiciones que oprimen a las mujeres","Es un personaje secundario sin importancia","Representa solo el amor maternal mal expresado"],correct:1,feedback:"Mamá Elena representa todo el sistema de valores tradicionales que usa las costumbres para controlar.",feedbackAlt:"Su crueldad tiene raíces en el mismo sistema que también la oprimió a ella."},
      {difficulty:"medium",mode:"critical",concept:"Rosaura",text:"¿Cómo funciona el personaje de Rosaura en relación al sistema que oprime a Tita?",options:["Rosaura es otra víctima inocente igual que Tita","Rosaura perpetúa el sistema al querer imponer a su hija Esperanza la misma tradición","Rosaura intenta activamente liberar a Tita","Rosaura no tiene ninguna función simbólica"],correct:1,feedback:"Rosaura reproduce la opresión: quiere que Esperanza también cuide a su madre de por vida.",feedbackAlt:"Este ciclo muestra que la opresión se perpetúa cuando las propias víctimas la internalizan."},
      {difficulty:"hard",mode:"critical",concept:"Pedro como personaje",text:"¿Por qué Pedro acepta casarse con Rosaura si ama a Tita?",options:["No amaba realmente a Tita","Muestra que Pedro es víctima y cómplice del sistema: elige estar cerca de Tita aunque dañe a todos","Es un error narrativo de la autora","Prueba que Pedro es un héroe completamente altruista"],correct:1,feedback:"Pedro no es un héroe romántico limpio: su decisión daña a Tita y a su propia esposa.",feedbackAlt:"Esquivel no idealiza a Pedro. El amor no justifica todas las decisiones."},
      {difficulty:"hard",mode:"highlight",concept:"El poder de la comida",text:"Subraya la frase que mejor expresa el mecanismo mágico central:",fragment:"Tita lo sabía desde siempre: que al incorporar sus emociones a la comida, éstas pasaban directamente a quienes la comían. La noche del pastel de bodas, sus lágrimas cayeron sobre la masa y todos los invitados sintieron una tristeza tan profunda que tuvieron que abandonar la fiesta.",correctHighlight:"al incorporar sus emociones a la comida, éstas pasaban directamente a quienes la comían",options:["sus lágrimas cayeron sobre la masa","al incorporar sus emociones a la comida, éstas pasaban directamente a quienes la comían","todos los invitados sintieron una tristeza tan profunda","tuvieron que abandonar la fiesta"],correct:1,feedback:"Las emociones de Tita se transmiten literalmente a través de su cocina.",feedbackAlt:"Esta idea convierte a Tita en poderosa a pesar de su situación de opresión."},
      {difficulty:"hard",mode:"critical",concept:"Esperanza",text:"¿Qué representa el final de la novela con Esperanza libre para casarse?",options:["Que las tradiciones finalmente triunfaron","Que el ciclo de opresión se rompe en la siguiente generación gracias a la resistencia de Tita","Que la novela tiene un final paradójico sin resolución","Que Mamá Elena tenía razón sobre el matrimonio"],correct:1,feedback:"Esperanza puede casarse libremente. Tita sacrificó su vida pero rompió el ciclo para la siguiente generación.",feedbackAlt:"El final es agridulce: la libertad de Esperanza es el legado de la prisión de Tita."},
      {difficulty:"easy",mode:"critical",concept:"El formato del libro",text:"¿Qué estructura original usa Esquivel en la novela?",options:["Está dividida por personajes, como un expediente","Está organizada en doce capítulos, uno por mes del año, cada uno con una receta de cocina","Está narrada en orden cronológico sin divisiones","Es una novela epistolar con cartas entre los personajes"],correct:1,feedback:"Cada mes trae una receta que coincide con los eventos emocionales del capítulo — la comida estructura el tiempo.",feedbackAlt:"Esta estructura única es la que da a la novela su carácter singular."},
      {difficulty:"easy",mode:"critical",concept:"El fuego final",text:"¿Qué ocurre al final de la novela con Tita y Pedro?",options:["Se casan formalmente y viven juntos","Al unirse por fin, su pasión genera un fuego que los consume a ambos y destruye la hacienda","Tita muere sola esperando a Pedro","Pedro abandona a Tita por una mujer más joven"],correct:1,feedback:"La muerte de los amantes es casi literal: el fuego de su amor, contenido toda una vida, los consume en el acto final.",feedbackAlt:"Esquivel lleva el realismo mágico hasta el extremo: las emociones reprimidas se convierten en fuego real."},
      {difficulty:"medium",mode:"critical",concept:"El narrador",text:"¿Quién narra la historia y qué importancia tiene ese punto de vista?",options:["Tita narra en primera persona su propia historia","La sobrina nieta de Tita narra la historia a partir de las recetas y el diario encontrado — transmisión oral y memoria familiar","Un narrador omnisciente sin relación con los personajes","Pedro narra la historia desde su perspectiva"],correct:1,feedback:"La transmisión generacional del relato es esencial: la historia de Tita vive porque fue preservada y contada.",feedbackAlt:"La narradora es prueba de que Tita ganó: su historia, aunque fue silenciada en vida, sobrevivió."},
      {difficulty:"medium",mode:"critical",concept:"Las rosas de sangre",text:"¿Qué simbolizan las rosas teñidas de sangre en el cuerpo de Tita?",options:["Una enfermedad física que padece Tita","El dolor de amar a alguien que no puede tener: las rosas son la materialización de sus emociones reprimidas","Un signo de que Tita tiene poderes mágicos sobrenaturales","Un rito tradicional de la región"],correct:1,feedback:"Las rosas absorben la sangre y el dolor de Tita y luego transmiten ese dolor a través de la comida hecha con ellas.",feedbackAlt:"Esquivel hace visible lo invisible: las emociones se vuelven objetos físicos con consecuencias reales."},
      {difficulty:"medium",mode:"fragment",concept:"La transmisión de emociones",text:"¿Qué técnica narrativa ilustra este pasaje?",fragment:"Toda la boda fue afectada. Los invitados, sin entender por qué, comenzaron a llorar en silencio. Una nostalgia insoportable los invadió. Añoraban algo que nunca habían tenido pero que sabían que habían perdido.",options:["La hipérbole romántica","El realismo mágico: las lágrimas de Tita en el pastel transmiten literalmente su dolor a todos los presentes","La descripción psicológica realista de la melancolía colectiva","Una metáfora del ambiente festivo"],correct:1,feedback:"El mecanismo mágico se activa: el dolor de Tita se transmite literalmente a través de la comida.",feedbackAlt:"Lo extraordinario se describe con la misma naturalidad que la boda."},
      {difficulty:"medium",mode:"critical",concept:"John Brown",text:"¿Qué representa el personaje de John Brown (el doctor) en la vida de Tita?",options:["Es el antagonista que bloquea el amor de Tita y Pedro","Es una figura de amor posible y sano que Tita rechaza porque su corazón ya está comprometido con Pedro","Es el personaje que representa los valores modernos de México","Es el narrador externo de la historia"],correct:1,feedback:"John Brown ofrece a Tita un amor real, presente y sano — pero ella elige el amor imposible con Pedro.",feedbackAlt:"Su rechazo revela algo sobre Tita: ha construido su identidad alrededor del amor prohibido."},
      {difficulty:"hard",mode:"critical",concept:"La tradición vs. el individuo",text:"¿Qué dice la novela sobre las tradiciones que se transmiten de madres a hijas?",options:["Las tradiciones son siempre positivas y preservan la identidad","Las tradiciones pueden ser herramientas de opresión cuando se convierten en obligaciones sin cuestionamiento","Las tradiciones son irrelevantes en el siglo XX","La novela no tiene postura sobre las tradiciones"],correct:1,feedback:"La tradición que obliga a Tita no nació del amor sino del control. Esquivel pregunta: ¿qué heredamos y por qué?",feedbackAlt:"La misma tradición que oprimió a Tita casi oprime a Esperanza — la continuidad del daño a través de generaciones."},
      {difficulty:"hard",mode:"highlight",concept:"El amor como rebeldía",text:"Subraya la frase que mejor captura la naturaleza política del amor de Tita:",fragment:"Tita entendió que amar a Pedro no era solo un sentimiento. Era una forma de decirle a Mamá Elena: 'No puedes quitarme esto. Aquí, en mi cocina, en mi cuerpo, en lo que cocino, soy libre aunque me hayas encadenado.'",correctHighlight:"Aquí, en mi cocina, en mi cuerpo, en lo que cocino, soy libre aunque me hayas encadenado",options:["amar a Pedro no era solo un sentimiento","No puedes quitarme esto","Aquí, en mi cocina, en mi cuerpo, en lo que cocino, soy libre aunque me hayas encadenado","Era una forma de decirle a Mamá Elena"],correct:2,feedback:"El amor de Tita es resistencia política: el único territorio que Mamá Elena no puede colonizar.",feedbackAlt:"Incluso encadenada, la cocina de Tita es su país soberano."},
      {difficulty:"medium",mode:"critical",concept:"El llanto fundacional",text:"¿Qué simboliza que Tita haya nacido llorando por la cebolla que picaba su madre?",options:["Una anécdota cómica sin significado más profundo","El nacimiento de Tita ya está marcado por el dolor de otro — ella nace literalmente impregnada de las emociones ajenas","Una complicación médica del parto","El primer ejemplo del humor negro de la novela"],correct:1,feedback:"Desde antes de nacer, Tita está destinada a absorber y transmitir las emociones a través de su cuerpo y su cocina.",feedbackAlt:"Su condición de 'canal emocional' no se desarrolla — nace con ella."},
      {difficulty:"hard",mode:"critical",concept:"La herencia de la opresión",text:"¿Qué revela que Mamá Elena también haya tenido un amor imposible en su juventud?",options:["Que Mamá Elena era hipócrita sin más","Que el ciclo de opresión tiene raíces en el propio dolor de quien oprime: Mamá Elena reproduce lo que ella misma sufrió","Que el amor imposible es una tradición familiar positiva","Que Mamá Elena y Tita son básicamente el mismo personaje"],correct:1,feedback:"El pasado de Mamá Elena humaniza y complica a la antagonista: es víctima y verdugo al mismo tiempo.",feedbackAlt:"La crueldad de Mamá Elena no nació de la nada — tiene historia, y esa historia la hace más trágica."},
      {difficulty:"hard",mode:"critical",concept:"El realismo mágico como método crítico",text:"¿Por qué Esquivel usa el realismo mágico para hablar de la condición de la mujer?",options:["Porque la fantasía hace la historia más entretenida","Porque hacer literales las emociones de Tita revela que su poder interior es real aunque la sociedad lo ignore y reprima","Porque García Márquez ya había establecido el estilo en Latinoamérica","Porque México tiene una tradición oral de historias mágicas"],correct:1,feedback:"Hacer visible lo que la sociedad hace invisible: las emociones de Tita importan tanto que literalmente transforman el mundo.",feedbackAlt:"El realismo mágico aquí no es decoración — es la forma de demostrar que lo que le pasa a Tita tiene peso real."},
    ],
    flashcards:[
      {id:"fc1",front:"¿Qué es el realismo mágico?",back:"Corriente donde elementos mágicos ocurren en contexto cotidiano y son aceptados como normales."},
      {id:"fc2",front:"¿Por qué Tita no puede casarse?",back:"La tradición obliga a la hija menor a cuidar a la madre hasta su muerte."},
      {id:"fc3",front:"¿Qué representa la cocina para Tita?",back:"El único espacio de libertad y poder: puede expresar sus emociones y afectar el mundo a través de la comida."},
      {id:"fc4",front:"¿Qué simboliza la receta en cada capítulo?",back:"La comida como vehículo de emociones: cada receta desencadena los eventos emocionales del capítulo."},
    ],
    debatePrompts:[{id:"chocolate-d1",question:"¿Es Tita una mujer que resiste o que acepta su destino?",context:"Nunca abandona la hacienda, pero su cocina transforma todo. ¿Eso es resistencia o resignación?"}],
    forumId:"chocolate-forum"
  },
  {
    id:"espiritus", title:"La casa de los espíritus", author:"Isabel Allende", year:1982,
    genre:"Realismo mágico", tagline:"La memoria es el arma de los sobrevivientes.",
    color:"#4A2070", spine:"#32154D", badgeIcon:"👻", badgeName:"Clarividente",
    questions:[
      {difficulty:"easy",mode:"critical",concept:"Clara del Valle",text:"¿Por qué Clara del Valle es el personaje central?",options:["Es la narradora sin poderes especiales","Tiene poderes de clarividencia y sus cuadernos son la fuente de toda la historia","Es la antagonista principal","Es la hija mayor de Esteban"],correct:1,feedback:"Clara es el corazón espiritual: sus poderes y cuadernos son la memoria que permite contar la historia.",feedbackAlt:"Sin sus cuadernos, la historia de tres generaciones no podría reconstruirse."},
      {difficulty:"easy",mode:"critical",concept:"Generaciones",text:"¿Cuáles son las tres generaciones femeninas principales?",options:["Clara, Esteban y Pedro García","Clara, Blanca y Alba — cada una representa una época de Chile","Férula, Blanca y Clara","Solo Clara y Alba"],correct:1,feedback:"Clara, Blanca y Alba son el eje. Tres generaciones de mujeres que enfrentan el mundo de maneras distintas.",feedbackAlt:"Allende construye la historia del país a través de estas tres mujeres."},
      {difficulty:"medium",mode:"critical",concept:"Esteban Trueba",text:"¿Por qué Esteban Trueba es un personaje complejo?",options:["Porque se arrepiente completamente al final","Porque a pesar de su violencia, ama genuinamente a su familia","Porque es bueno y sus actos tienen justificación moral","Porque es un personaje secundario"],correct:1,feedback:"Trueba comete actos terribles pero también ama profundamente. Encarna las contradicciones de su clase.",feedbackAlt:"Su amor es real pero su violencia también."},
      {difficulty:"medium",mode:"critical",concept:"Historia y ficción",text:"¿Qué relación tiene la novela con la historia real de Chile?",options:["Ninguna, es completamente ficticia","Refleja el golpe de estado de 1973 y la dictadura con nombres ficticios","Es una autobiografía directa","Está ambientada en un país inventado"],correct:1,feedback:"La novela es una alegoría de Chile: el golpe militar, la dictadura y la represión están presentes.",feedbackAlt:"Isabel Allende era sobrina del presidente Allende."},
      {difficulty:"hard",mode:"critical",concept:"Memoria y escritura",text:"¿Por qué los cuadernos de Clara son políticamente importantes?",options:["Son solo un recurso estético","Son la memoria que permite resistir el olvido impuesto por la dictadura","Prueban los poderes mágicos de Clara","Son el único elemento de realismo mágico"],correct:1,feedback:"Los cuadernos son un acto político: la escritura es resistencia contra los regímenes que borran la historia.",feedbackAlt:"Escribir es resistir."},
      {difficulty:"hard",mode:"highlight",concept:"Transmisión generacional",text:"Subraya la frase que mejor expresa el tema central de la memoria como resistencia:",fragment:"Alba comprendió entonces que el pasado no termina nunca. La historia de su abuela, de su madre, la suya propia, no era una cadena de desgracias sino la prueba de que algo sobrevive: el amor y la memoria que une a los que se fueron con los que siguen.",correctHighlight:"el amor y la memoria que une a los que se fueron con los que siguen",options:["el pasado no termina nunca","no era una cadena de desgracias","el amor y la memoria que une a los que se fueron con los que siguen","la prueba de que algo sobrevive"],correct:2,feedback:"La memoria no es nostalgia, es el lazo que da sentido a la historia familiar y colectiva.",feedbackAlt:"Lo que une generaciones no es la sangre sino la memoria compartida."},
      {difficulty:"easy",mode:"critical",concept:"Blanca",text:"¿Con quién se enamora Blanca y por qué es una relación problemática?",options:["Con un político de la ciudad","Con Pedro Tercero García, hijo de un campesino que trabaja en Las Tres Marías — una relación que cruza la línea de clase","Con un militar del régimen","Con un primo de Esteban"],correct:1,feedback:"El amor de Blanca y Pedro Tercero es la continuación del conflicto de clase en la siguiente generación.",feedbackAlt:"Esteban acepta el amor de Clara con dificultad pero el de su hija con un campesino lo enfrenta directamente."},
      {difficulty:"easy",mode:"critical",concept:"El Senador Trueba",text:"¿Qué posición política tiene Esteban Trueba?",options:["Es comunista convencido","Es senador conservador que se opone a la reforma agraria y a los movimientos de izquierda","Es un político neutral sin ideología","Es alcalde de un pueblo pequeño"],correct:1,feedback:"Trueba es el bloque conservador personificado: terrateniente que lucha contra cualquier cambio que amenace su clase.",feedbackAlt:"Su ideología política hace especialmente dolorosa la historia de su familia y de su país."},
      {difficulty:"easy",mode:"critical",concept:"Férula",text:"¿Cuál es la relación entre Férula y Clara y por qué es importante?",options:["Son rivales por el amor de Esteban","Férula desarrolla una devoción obsesiva por Clara que Esteban finalmente hace expulsar de la casa","Son hermanas que se apoyan mutuamente","Es la profesora de Clara en la infancia"],correct:1,feedback:"La relación Férula-Clara introduce el tema del amor posesivo que sofoca en lugar de liberar.",feedbackAlt:"Esteban expulsa a Férula por celos — su propio amor posesivo proyectado en su hermana."},
      {difficulty:"medium",mode:"critical",concept:"El golpe de estado",text:"¿Cómo afecta el golpe militar a las distintas generaciones de la familia?",options:["Solo afecta a Alba, la generación más joven","Cada generación sufre de forma diferente: Clara lo prevé, Blanca esconde a Pedro Tercero, Alba es capturada y torturada","El golpe no afecta directamente a la familia porque son aristocracia","Esteban Trueba protege a su familia completamente del golpe"],correct:1,feedback:"El golpe atraviesa toda la familia. Allende muestra cómo la violencia política llega a todos los hogares.",feedbackAlt:"La historia privada y la historia pública son inseparables en esta novela."},
      {difficulty:"medium",mode:"critical",concept:"La escritura como acto",text:"¿Por qué escribe Alba la historia al final de la novela?",options:["Para vengarse de Esteban Trueba","Para cumplir el deseo de Clara, pero también para sobrevivir psicológicamente a la tortura y preservar la memoria de lo ocurrido","Para publicar un libro de memorias familiares","Porque necesita dinero después del golpe"],correct:1,feedback:"La escritura es terapia y resistencia: Alba escribe para no morir interiormente y para que nadie olvide.",feedbackAlt:"El acto de escribir la novela dentro de la novela es la afirmación más poderosa de que la memoria puede sobrevivir a la barbarie."},
      {difficulty:"medium",mode:"critical",concept:"Las clases sociales",text:"¿Cómo usa Allende la relación entre Esteban y sus campesinos para criticar el sistema?",options:["Esteban es un patrón ejemplar que cuida a sus trabajadores","Esteban viola a las campesinas y explota su trabajo, mostrando que el sistema de hacienda era estructuralmente violento","Los campesinos trabajan voluntariamente para Esteban","La novela no aborda el conflicto de clases directamente"],correct:1,feedback:"Las violaciones de Esteban no son solo crímenes individuales: son el símbolo del poder absoluto del patrón sobre los desposeídos.",feedbackAlt:"Allende muestra que la violencia política del golpe tiene raíces en la violencia estructural de siglos."},
      {difficulty:"medium",mode:"fragment",concept:"La clarividencia como metáfora",text:"¿Qué función tiene la clarividencia de Clara más allá de lo mágico?",fragment:"Clara anotaba todo: las fechas importantes, los sueños, los presentimientos. Sabía que el pasado es frágil si no se escribe, que el futuro puede adivinarse en los detalles que los demás descartan.",options:["Es un poder sobrenatural sin función narrativa","La clarividencia de Clara representa la capacidad de leer la realidad más profundamente, de ver lo que la ideología y el poder quieren ocultar","Es solo un elemento decorativo del realismo mágico","Representa la religiosidad de Clara"],correct:1,feedback:"Clara 've' porque presta atención a lo que otros ignoran. Su 'magia' es en parte una metáfora de la lucidez.",feedbackAlt:"Los que 'ven' son los que no se dejan engañar por las apariencias del poder."},
      {difficulty:"hard",mode:"critical",concept:"El arrepentimiento de Trueba",text:"¿Es el arrepentimiento final de Esteban Trueba suficiente para redimirlo?",options:["Sí, porque ayuda a salvar a Alba","No, porque el daño ya está hecho y su sistema de valores causó el golpe que destrozó a su familia","Sí, porque cambió sus ideas políticas al final","No, porque su arrepentimiento es hipócrita"],correct:1,feedback:"Allende no da absolución fácil. Trueba ayuda a Alba pero no puede deshacer décadas de violencia y colaboración con el régimen.",feedbackAlt:"El arrepentimiento tardío no borra los efectos de una vida de privilegio y violencia."},
      {difficulty:"hard",mode:"critical",concept:"Feminismo y resistencia",text:"¿Cómo articula la novela la resistencia femenina frente al patriarcado?",options:["A través de la rebelión política directa de las mujeres","A través de la preservación de la memoria, el amor, y la escritura como formas de poder que el sistema patriarcal no puede controlar completamente","A través de la violencia revolucionaria","Las mujeres no resisten, solo sobreviven"],correct:1,feedback:"Clara escribe, Blanca ama contra la voluntad de su padre, Alba sobrevive y cuenta — cada una resiste en su terreno.",feedbackAlt:"La resistencia no siempre es política: preservar la historia y el amor también son actos de resistencia."},
      {difficulty:"medium",mode:"critical",concept:"Nívea del Valle",text:"¿Qué representa Nívea del Valle, la madre de Clara?",options:["La primera antagonista de la historia","La primera sufragista de la familia: una mujer que lucha activamente por los derechos de las mujeres, iniciando la tradición de resistencia femenina","Una figura decorativa del pasado","La madre biológica de Esteban"],correct:1,feedback:"Nívea inicia la cadena: de ella a Clara a Blanca a Alba, cada generación lleva más lejos la capacidad de resistir.",feedbackAlt:"La novela no empieza con Clara por accidente: el origen de la cadena importa."},
      {difficulty:"hard",mode:"critical",concept:"La violencia sexual como arma política",text:"¿Qué dice la novela sobre la violación como instrumento de poder político?",options:["La violación es solo un crimen individual en la novela","La violación de las campesinas por Trueba y la tortura de Alba en la dictadura forman un continuum: el cuerpo de la mujer como territorio donde el poder ejerce su control","La violación no tiene connotaciones políticas en la novela","Solo la violación en contexto de guerra tiene significado político"],correct:1,feedback:"Allende traza una línea directa: la violencia de Trueba contra sus campesinas y la tortura de Alba en los campos son la misma lógica de poder.",feedbackAlt:"La violencia sexual es instrumentalizada por el poder en todos los contextos de la novela."},
      {difficulty:"hard",mode:"critical",concept:"El socialismo en la novela",text:"¿Cómo presenta Allende la promesa del socialismo y su fracaso?",options:["Como un sistema perfectamente exitoso","Con honestidad: la esperanza fue real, la destrucción fue real, y los sobrevivientes deben reconstruir sin abandonar la memoria de lo que pudo ser","Como una utopía imposible desde el principio","Sin posición política clara"],correct:1,feedback:"Allende no idealiza ni condena: narra la esperanza que existió y la violencia que la destruyó, sin perder la complejidad.",feedbackAlt:"La novela es el testimonio de que algo fue posible y fue destruido — esa es su carga política más profunda."},
      {difficulty:"hard",mode:"highlight",concept:"El poder de la historia",text:"Subraya la frase que mejor expresa por qué escribir la historia es en sí mismo un acto político:",fragment:"Esta historia no es solo nuestra, Clara. Es la historia de todos. Si no la escribimos, si no la guardamos, ellos podrán decir que no ocurrió. Que nunca fuimos. Que nunca amamos ni sufrimos.",correctHighlight:"ellos podrán decir que no ocurrió",options:["Esta historia no es solo nuestra","si no la guardamos","ellos podrán decir que no ocurrió","Que nunca fuimos"],correct:2,feedback:"La escritura como acto político: sin registro, la violencia puede ser negada y la memoria borrada.",feedbackAlt:"Los regímenes no solo torturan — también intentan hacer desaparecer la evidencia de que torturaron."},
    ],
    flashcards:[
      {id:"fc1",front:"¿Quiénes son las tres generaciones?",back:"Clara (abuela), Blanca (madre) y Alba (nieta). Cada una representa una época y forma de resistir."},
      {id:"fc2",front:"¿Qué representa Esteban Trueba?",back:"La oligarquía chilena: poderosa y violenta, pero capaz de amor."},
      {id:"fc3",front:"¿Por qué son importantes los cuadernos de Clara?",back:"Son la memoria que permite reconstruir la historia familiar y resistir el olvido."},
      {id:"fc4",front:"¿A qué evento histórico alude la novela?",back:"Al golpe de estado de 1973 en Chile y a la dictadura de Pinochet."},
    ],
    debatePrompts:[{id:"espiritus-d1",question:"¿Puede Esteban Trueba ser perdonado al final?",context:"Ayuda a salvar a Alba a pesar de todo lo que causó. ¿El arrepentimiento tardío tiene valor moral real?"}],
    forumId:"espiritus-forum"
  },
  {
    id:"maus", title:"Maus", author:"Art Spiegelman", year:1991,
    genre:"Novela gráfica / Holocausto", tagline:"Una historia de supervivencia. Dos.",
    color:"#2A2A2A", spine:"#0A0A0A", badgeIcon:"🐭", badgeName:"Testigo",
    questions:[
      {difficulty:"easy",mode:"critical",concept:"Estructura narrativa",text:"¿Cuántas historias se narran simultáneamente en Maus?",options:["Solo la historia del Holocausto","Dos: la supervivencia de Vladek en el pasado y la relación Vladek-Artie en el presente","Tres: Vladek, Artie y Mala","Una sola historia lineal"],correct:1,feedback:"Maus entrelaza dos tiempos: el Holocausto narrado por Vladek y el presente donde Artie lo entrevista.",feedbackAlt:"Esta doble narrativa es central."},
      {difficulty:"easy",mode:"critical",concept:"Representación visual",text:"¿Por qué los judíos son representados como ratones y los nazis como gatos?",options:["Para hacer el cómic más entretenido","Para usar la alegoría visual: los nazis cazaban a los judíos como gatos cazan ratones","Porque Spiegelman prefirió animales por razones estéticas","Porque no sabía cómo dibujar personas"],correct:1,feedback:"La alegoría visual es brutal: los nazis perseguían a los judíos exactamente como depredadores a presas.",feedbackAlt:"Spiegelman usa la metáfora animal para mostrar la lógica deshumanizadora del nazismo."},
      {difficulty:"medium",mode:"critical",concept:"Vladek y los diarios",text:"¿Qué significa el momento en que Vladek destruye los diarios de Anja?",options:["Vladek los destruyó para proteger la privacidad familiar y Artie lo comprende","Vladek los destruyó por dolor y Artie lo llama 'asesino' porque perdió la voz de su madre","Vladek los vendió y Artie no reacciona","Los diarios fueron destruidos accidentalmente"],correct:1,feedback:"Artie llama 'asesino' a su padre: destruir los diarios fue borrar la voz de Anja, su segunda muerte.",feedbackAlt:"Este momento muestra que el trauma no está solo en el pasado."},
      {difficulty:"hard",mode:"critical",concept:"Meta-narrativa",text:"¿Qué metáfora usa Spiegelman cuando dibuja personas humanas discutiendo el éxito del libro?",options:["Muestra que el cómic es popular","Cuestiona la representación del sufrimiento: ¿tiene derecho alguien a convertir el Holocausto en éxito comercial?","Celebra el logro artístico","Es solo un capítulo autobiográfico"],correct:1,feedback:"Spiegelman se pregunta si tiene derecho a narrar el Holocausto y beneficiarse de ese relato.",feedbackAlt:"Al dibujar personas en lugar de animales, rompe la representación para cuestionar la representación misma."},
      {difficulty:"easy",mode:"critical",concept:"Vladek",text:"¿Qué característica tiene Vladek Spiegelman como narrador de su historia?",options:["Es completamente objetivo y detallado","Es subjetivo, a veces poco confiable, y filtrado por décadas de trauma y su carácter difícil","Es un narrador heroico sin contradicciones","Es indiferente a lo que vivió"],correct:1,feedback:"Vladek es un sobreviviente complejo: no es un héroe ideal sino un hombre marcado por el trauma, lo que hace su testimonio más creíble.",feedbackAlt:"Su carácter difícil en el presente refleja los costos psicológicos reales de sobrevivir al Holocausto."},
      {difficulty:"easy",mode:"critical",concept:"Anja",text:"¿Quién es Anja y qué le ocurrió?",options:["Es la esposa de Artie que lo apoya mientras escribe Maus","Es la primera esposa de Vladek que sobrevivió el Holocausto pero se suicidó años después","Es la madre de Vladek que murió en Auschwitz","Es una personaje ficticia"],correct:1,feedback:"Anja sobrevivió el campo pero nunca pudo reponerse del trauma y se suicidó. Su ausencia es el agujero central de la historia.",feedbackAlt:"El suicidio de Anja es una segunda pérdida que también Artie hereda — el trauma del sobreviviente se transmite."},
      {difficulty:"easy",mode:"critical",concept:"El Pulitzer",text:"¿Qué distinción recibió Maus en 1992?",options:["El Nobel de Literatura","El Premio Pulitzer — el primer y único cómic en recibirlo","El Man Booker Prize","El Premio Hugo de ciencia ficción"],correct:1,feedback:"Maus ganó el Pulitzer especial en 1992, legitimando al cómic como forma literaria seria capaz de abordar temas históricos de la mayor gravedad.",feedbackAlt:"Este reconocimiento transformó la percepción del cómic como arte."},
      {difficulty:"medium",mode:"critical",concept:"La culpa del sobreviviente",text:"¿Qué es la 'culpa del sobreviviente' y cómo aparece en Vladek?",options:["El orgullo de haber sobrevivido cuando otros no pudieron","El sentimiento de culpa por seguir vivo cuando millones murieron, que a menudo se manifiesta como comportamiento errático o dificultad para conectar","La gratitud hacia los que murieron para que él viviera","La indiferencia ante la muerte de otros"],correct:1,feedback:"Vladek es mezquino, difícil, guarda cosas inútiles, tiene conflictos con Artie — muchos de esos rasgos son consecuencias del trauma.",feedbackAlt:"La culpa del sobreviviente no es literaria: es un síndrome psicológico real."},
      {difficulty:"medium",mode:"critical",concept:"El formato cómic",text:"¿Por qué Spiegelman eligió el formato de novela gráfica para contar el Holocausto?",options:["Porque no sabía escribir en prosa","Porque el cómic permite mostrar simultáneamente dos tiempos y hacer visible lo que las palabras solas no pueden transmitir con la misma inmediatez","Porque era más barato de publicar","Porque nadie quería publicar una novela convencional sobre el tema"],correct:1,feedback:"El dibujo hace visible lo que las palabras narran: Spiegelman puede mostrar el pasado y el presente en la misma página.",feedbackAlt:"El cómic no trivializa el Holocausto — lo hace accessible de una forma diferente, igualmente poderosa."},
      {difficulty:"medium",mode:"critical",concept:"Los polacos como cerdos",text:"¿Qué implica representar a los polacos como cerdos?",options:["Que Spiegelman odia a los polacos","Que el sistema de alegorías animales tiene límites y contradicciones: los polacos tenían roles ambiguos, a veces colaborando con los nazis y a veces ayudando a judíos","Que los polacos eran aliados de los nazis","Que los cerdos son neutrales en el sistema de la novela"],correct:1,feedback:"La ambigüedad de los cerdos polacos refleja la realidad histórica: algunos colaboraron con los nazis, otros arriesgaron sus vidas para esconder judíos.",feedbackAlt:"El sistema de metáforas animales se complica cuando la realidad histórica es compleja."},
      {difficulty:"medium",mode:"fragment",concept:"La transmisión del trauma",text:"¿Qué revela esta escena sobre cómo el trauma se transmite entre generaciones?",fragment:"Artie: 'A veces no puedo entender por qué me siento deprimido o culpable. No viví lo que vivió mi padre.' Su terapeuta, también sobreviviente, le responde: 'Tus padres no pudieron darte lo que el Holocausto les quitó antes de que nacieras.'",options:["Que la terapia no funciona para hijos de sobrevivientes","Que el trauma no termina con la generación que lo vivió — sus efectos se transmiten a los hijos aunque no lo hayan vivido directamente","Que Artie exagera su sufrimiento","Que todos los hijos de sobrevivientes deben ir a terapia"],correct:1,feedback:"El trauma intergeneracional es un fenómeno real: la segunda generación carga heridas que no son suyas pero que también los moldean.",feedbackAlt:"Maus no es solo sobre el Holocausto — también es sobre lo que el Holocausto hizo a las familias que sobrevivieron."},
      {difficulty:"hard",mode:"critical",concept:"¿Quién tiene derecho a contar el horror?",text:"¿Qué dilema ético plantea Spiegelman al contar la historia de su padre?",options:["Que los cómics no son el formato adecuado para temas serios","Que convertir el sufrimiento de otro en arte narrativo implica una apropiación que debe cuestionarse, incluso cuando el narrador es el hijo de la víctima","Que los artistas tienen libertad absoluta para usar cualquier historia","Que la historia de Vladek pertenece a todos los judíos"],correct:1,feedback:"Spiegelman no resuelve el dilema — lo expone. El arte sobre el trauma de otro siempre implica una tensión ética.",feedbackAlt:"Este cuestionamiento convierte a Maus en una obra meta-artística, no solo un testimonio histórico."},
      {difficulty:"hard",mode:"critical",concept:"La fidelidad a la historia",text:"¿Cómo maneja Spiegelman el hecho de que Vladek es un narrador poco confiable?",options:["Lo corrige en cada viñeta con notas al pie","Muestra las contradicciones y las señala explícitamente, invitando al lector a notar que toda memoria es imperfecta","Ignora las inconsistencias para no desacreditar a su padre","Inventa las partes que Vladek no recuerda"],correct:1,feedback:"Al mostrar sus propias dudas sobre el relato, Spiegelman honra la complejidad de la memoria sin falsificarla.",feedbackAlt:"Esta autoreflexividad es parte de la honestidad artística de Maus."},
      {difficulty:"hard",mode:"critical",concept:"Auschwitz en el cómic",text:"¿Por qué las imágenes de Auschwitz en Maus son más impactantes que muchas descripciones escritas?",options:["Porque las imágenes siempre son más impactantes que las palabras","Porque Spiegelman usa la yuxtaposición del tiempo presente y el horror pasado, y la escala del dibujo hace tangible lo que los números estadísticos abstractos no pueden comunicar","Porque el cómic tiene más páginas que una novela convencional","Porque Spiegelman fue testigo directo"],correct:1,feedback:"Ver el tamaño de las barracas, los hornos, los ratones en fila — el dibujo escala el horror a lo humano y concreto.",feedbackAlt:"Lo visual hace concreto lo que los números estadísticos hacen abstracto."},
      {difficulty:"medium",mode:"critical",concept:"La identidad del cómic",text:"¿Qué dice el hecho de que Spiegelman use el cómic para narrar el Holocausto sobre la legitimidad de las formas artísticas?",options:["Que el cómic es inferior y no debería abordar temas serios","Que ninguna forma artística es inherentemente inferior — lo que importa es la profundidad del tratamiento, no el medio","Que el Pulitzer fue un error","Que el cómic es superior a la prosa para narrar el horror"],correct:1,feedback:"Maus demostró que el formato no determina la profundidad. El cómic puede hacer literatura mayor.",feedbackAlt:"El Pulitzer ratificó lo que los lectores ya sabían: la forma no limita el contenido."},
      {difficulty:"medium",mode:"critical",concept:"Mala e identidad",text:"¿Qué representa Mala, la segunda esposa de Vladek, en la dinámica familiar?",options:["Es la antagonista sin matices","Es la persona que vive en la sombra de Anja: Vladek la compara constantemente con su primera esposa, haciendo imposible cualquier relación sana con ella","Es el personaje que narra la historia","Es la heroína de la segunda parte"],correct:1,feedback:"Mala carga con la sombra de Anja — Vladek nunca puede dejar de compararlas, y eso revela cómo el trauma también daña las relaciones presentes.",feedbackAlt:"El trauma de Vladek no termina en Auschwitz: sigue destruyendo relaciones décadas después."},
      {difficulty:"hard",mode:"critical",concept:"El sistema animal como límite",text:"¿Cuándo se quiebra el sistema de metáforas animales y qué significa ese quiebre?",options:["Cuando Artie no puede dibujar correctamente","Cuando Spiegelman dibuja a sí mismo y a los demás como humanos con máscaras de ratón — el sistema se colapsa ante la imposibilidad de reducir el horror a una metáfora limpia","Cuando introduce personajes reales con nombres reales","El sistema nunca se quiebra"],correct:1,feedback:"La máscara de ratón sobre un rostro humano muestra que la metáfora tiene límites: algunos horrores se resisten a ser domesticados por el arte.",feedbackAlt:"Este momento meta-narrativo es uno de los más poderosos del cómic."},
      {difficulty:"hard",mode:"critical",concept:"Vladek y el prejuicio",text:"¿Qué revela que el propio Vladek tenga comportamientos racistas hacia los afroamericanos?",options:["Que Vladek era una mala persona","Que haber sido víctima del racismo no inmuniza contra otros prejuicios: las víctimas pueden reproducir actitudes opresivas contra otros grupos","Que Spiegelman idealiza a su padre","Que el racismo siempre se aprende en la infancia"],correct:1,feedback:"Spiegelman no protege la imagen de su padre: muestra sus contradicciones. Eso hace a Vladek más humano y complejo, no menos.",feedbackAlt:"Este detalle hace de Maus algo más que un libro sobre el Holocausto — es un libro sobre los humanos complicados que lo vivieron."},
      {difficulty:"hard",mode:"highlight",concept:"La culpa del arte",text:"Subraya la frase que mejor captura el dilema central de Spiegelman al escribir Maus:",fragment:"Escribir Maus me hizo famoso. Me hizo rico. Y a veces siento que construí mi carrera sobre los cadáveres de seis millones de personas. No sé si eso es arte o algo más oscuro.",correctHighlight:"construí mi carrera sobre los cadáveres de seis millones de personas",options:["Escribir Maus me hizo famoso","No sé si eso es arte o algo más oscuro","construí mi carrera sobre los cadáveres de seis millones de personas","Me hizo rico"],correct:2,feedback:"Spiegelman no celebra el éxito de Maus — lo interroga. Esta honestidad es parte de lo que hace grande al libro.",feedbackAlt:"Un artista que no se cuestiona su propio trabajo no puede crear arte verdaderamente honesto."},
    ],
    flashcards:[
      {id:"fc1",front:"¿Por qué los judíos son ratones y los nazis gatos?",back:"Alegoría visual: los nazis cazaban a los judíos como depredadores a presas."},
      {id:"fc2",front:"¿Qué son las dos historias de Maus?",back:"El Holocausto narrado por Vladek (pasado) y la relación Vladek-Artie mientras lo entrevista (presente)."},
      {id:"fc3",front:"¿Por qué Artie llama 'asesino' a su padre?",back:"Vladek destruyó los diarios de Anja, borrando su voz: fue una segunda muerte de su madre."},
      {id:"fc4",front:"¿Qué logro editorial tiene Maus?",back:"Ganó el Premio Pulitzer en 1992, siendo el primer y único cómic en recibirlo."},
    ],
    debatePrompts:[{id:"maus-d1",question:"¿Tiene Artie derecho a contar la historia de su padre?",context:"Es el trauma de otro. Pero también es su historia como hijo. ¿Dónde está el límite entre testimonio y apropiación?"}],
    forumId:"maus-forum"
  },
  {
    id:"principito", title:"El principito", author:"Antoine de Saint-Exupéry", year:1943,
    genre:"Fábula filosófica", tagline:"Lo esencial es invisible a los ojos.",
    color:"#1A5E8A", spine:"#0E3D5C", badgeIcon:"⭐", badgeName:"Explorador",
    questions:[
      {difficulty:"easy",mode:"critical",concept:"El dibujo de la boa",text:"¿Por qué los adultos confundían el primer dibujo del narrador con un sombrero?",options:["Porque era un dibujo muy malo","Porque los adultos solo ven lo superficial, no la realidad interior","Porque realmente era un sombrero","Porque el narrador no sabía dibujar boas"],correct:1,feedback:"El dibujo es la metáfora central: los adultos ven solo la superficie, nunca el elefante interior.",feedbackAlt:"Esta incapacidad de ver 'desde adentro' es la crítica de Saint-Exupéry al mundo adulto."},
      {difficulty:"easy",mode:"fragment",concept:"Los baobabs",text:"¿Qué peligro representan los baobabs?",fragment:"Si descuidas un baobab cuando es pequeño, nunca podrás deshacerte de él. Invade todo el planeta. Lo perfora con sus raíces.",options:["Son venenosos para el Principito","Sus raíces pueden destruir el asteroide si no se arrancan a tiempo","Bloquean la luz del sol","Son el hogar de animales peligrosos"],correct:1,feedback:"Los baobabs son la metáfora de los malos pensamientos: deben combatirse cuando son pequeños.",feedbackAlt:"Saint-Exupéry usa los baobabs para hablar de los vicios y malos hábitos irradicables."},
      {difficulty:"medium",mode:"critical",concept:"El Zorro",text:"¿Cuál es el secreto que el Zorro le revela al Principito?",options:["Que la vida es corta","Lo esencial es invisible a los ojos: solo se ve bien con el corazón","Que los adultos son irremediablemente malos","Que debe regresar a su planeta"],correct:1,feedback:"'Lo esencial es invisible a los ojos' es la tesis del libro.",feedbackAlt:"Esta frase también explica el vínculo con la Rosa."},
      {difficulty:"hard",mode:"critical",concept:"El regreso",text:"¿Qué método usa el Principito para regresar a su planeta?",options:["Construye una nave espacial","Deja que la serpiente lo pique — su veneno lo libera del cuerpo para regresar","El narrador lo lleva de regreso","Regresa volando por sus propios medios"],correct:1,feedback:"La picadura de la serpiente es una muerte simbólica: el cuerpo queda, el Principito vuela de regreso.",feedbackAlt:"Saint-Exupéry usa esta escena para hablar de la muerte no como fin sino como retorno."},
      {difficulty:"easy",mode:"critical",concept:"La Rosa",text:"¿Por qué la Rosa del Principito es única entre todas las rosas?",options:["Porque es la más bella del universo","Porque él la ha cuidado, regado y escuchado — el tiempo dedicado crea el vínculo que la hace única","Porque es de un color especial","Porque fue un regalo del Zorro"],correct:1,feedback:"Hay cinco mil rosas iguales, pero la suya es única porque la ha cuidado. El amor crea el valor, no la rareza.",feedbackAlt:"El Zorro lo explica: 'Eres responsable de lo que has domesticado.'"},
      {difficulty:"easy",mode:"critical",concept:"Los planetas visitados",text:"¿Qué critica Saint-Exupéry con los adultos que vive el Principito en los pequeños planetas?",options:["Que los adultos son malvados por naturaleza","Que los adultos están atrapados en sus propias obsesiones (poder, vanidad, dinero) y han perdido la capacidad de maravillarse","Que los planetas pequeños son malos lugares para vivir","Que los adultos no saben hablar con niños"],correct:1,feedback:"El rey, el vanidoso, el bebedor, el hombre de negocios — cada uno es una obsesión adulta convertida en caricatura.",feedbackAlt:"Saint-Exupéry no odia a los adultos: los llora. Fueron niños que olvidaron."},
      {difficulty:"easy",mode:"critical",concept:"El narrador",text:"¿Quién es el narrador adulto y qué relación tiene con la infancia?",options:["Es un niño que fantasea con planetas","Es un piloto que de niño intentó dibujar una boa y los adultos no la comprendieron — conserva esa sensibilidad infantil","Es el propio Saint-Exupéry sin disfraz","Es un maestro que relata la historia a sus alumnos"],correct:1,feedback:"El narrador es el puente: un adulto que no olvidó completamente cómo ver el mundo como niño.",feedbackAlt:"Su dibujo de la boa al inicio establece todo: hay adultos que aún pueden 'ver'."},
      {difficulty:"medium",mode:"critical",concept:"La domesticación",text:"¿Qué significa 'domesticar' según el Zorro?",options:["Amaestrar a un animal para que obedezca","Crear lazos — hacerse necesario el uno para el otro hasta que el otro se vuelve único en el mundo","Adquirir una mascota","Cuidar un jardín"],correct:1,feedback:"'Domesticar' es crear responsabilidad y unicidad: antes de que te domestiquen, eres uno entre millones.",feedbackAlt:"El Zorro da al Principito la clave para entender por qué su Rosa importa."},
      {difficulty:"medium",mode:"critical",concept:"La serpiente",text:"¿Qué simboliza la serpiente al inicio y al final?",options:["El peligro del desierto sin más significado","El umbral entre mundos: la serpiente puede enviar al Principito de regreso a su planeta, es la muerte como puerta","Es el antagonista de la historia","Representa la tentación"],correct:1,feedback:"La serpiente es ambivalente: peligrosa y necesaria. Es la única que puede dar al Principito lo que necesita para volver.",feedbackAlt:"Saint-Exupéry resignifica la muerte como transición, no como final."},
      {difficulty:"medium",mode:"critical",concept:"La pregunta sobre el cordero",text:"¿Por qué el Principito insiste tanto en que el narrador dibuje un cordero?",options:["Por capricho infantil","Porque necesita algo que coma los baobabs antes de que destruyan su pequeño planeta","Porque le gustan los animales","Para probar si el narrador es buen artista"],correct:1,feedback:"Los baobabs son una amenaza real: si crecen sin control pueden partir el planeta. El cordero es una solución práctica.",feedbackAlt:"La preocupación por los baobabs muestra que el Principito tiene responsabilidades reales, no es solo un niño fantasioso."},
      {difficulty:"medium",mode:"fragment",concept:"Lo esencial invisible",text:"¿Qué revela este fragmento sobre la forma de conocer del Principito vs. los adultos?",fragment:"Los adultos aman los números. Cuando les hablas de un amigo nuevo, nunca preguntan lo que importa. Preguntan: ¿cuántos años tiene? ¿cuánto gana? ¿cuánto pesa? Solo entonces creen conocerlo.",options:["Que los adultos son mejores para conocer personas","Que los adultos usan métricas que no capturan lo esencial: las personas importan por lo que son, no por lo que pesan o ganan","Que los niños son mejores en estadísticas","Que los adultos son curiosos"],correct:1,feedback:"Los números no te dicen si alguien ríe bien o si ama las mariposas. Los adultos confunden cuantificar con conocer.",feedbackAlt:"Esta crítica es profundamente filosófica: hay formas de conocimiento que las métricas no pueden capturar."},
      {difficulty:"medium",mode:"critical",concept:"El planeta B-612",text:"¿Por qué da Saint-Exupéry un número al planeta del Principito en lugar de un nombre?",options:["Porque los planetas tienen números en astronomía real","Para satirizar cómo los adultos necesitan catalogar, clasificar y numerar todo para tomarse algo en serio","Por accidente narrativo","Para que parezca más científico"],correct:1,feedback:"El asteroide B-612 solo lo tomaron en serio cuando lo redescubrió un astrónomo vestido de europeo. Con traje, la misma información fue aceptada.",feedbackAlt:"El nombre vs. número critica el formalismo adulto: solo creemos lo que encaja en nuestros sistemas de catalogación."},
      {difficulty:"hard",mode:"critical",concept:"La muerte como metáfora",text:"¿Qué visión de la muerte propone Saint-Exupéry a través del regreso del Principito?",options:["Que la muerte es el final de todo","Que la muerte es un regreso: el cuerpo es solo el cascaron, y quien amamos vuelve a donde pertenece","Que la muerte es una ilusión","Que Saint-Exupéry no aborda la muerte directamente"],correct:1,feedback:"Saint-Exupéry perdió amigos en la guerra. Su visión de la muerte como retorno es consuelo filosófico genuino.",feedbackAlt:"La imagen del Principito 'cayendo suavemente' no es violenta — es una partida."},
      {difficulty:"hard",mode:"critical",concept:"El libro como carta",text:"¿Por qué Saint-Exupéry dedicó el libro a Léon Werth 'cuando era pequeño'?",options:["Porque Léon Werth era un personaje ficticio","Porque la dedicatoria reconoce que todos los adultos fueron niños y que hablarle al niño que alguna vez fue es la forma más honesta de hablarle al adulto","Porque Léon Werth era un amigo fallecido","Porque Saint-Exupéry no quería que los adultos leyeran el libro"],correct:1,feedback:"La dedicatoria es el corazón del libro: todo adulto tiene un niño adentro que puede ser convocado.",feedbackAlt:"Saint-Exupéry no renuncia a los adultos — les pide que recuerden quiénes eran."},
      {difficulty:"medium",mode:"critical",concept:"Los viajes como estructura",text:"¿Qué representa la secuencia de planetas que visita el Principito antes de llegar a la Tierra?",options:["Una aventura sin propósito literario","Un recorrido crítico por las obsesiones adultas: el poder, la vanidad, la adicción, el conocimiento vacío, el trabajo sin sentido — cada planeta es un tipo de soledad adulta diferente","Los planetas del sistema solar real","Una descripción del espacio exterior"],correct:1,feedback:"Cada planeta es un vicio adulto: la obsesión que hace a un ser humano incapaz de conectar genuinamente con otros.",feedbackAlt:"El Principito viaja solo para entender que los adultos han perdido algo esencial — y ese algo es lo que él todavía tiene."},
      {difficulty:"hard",mode:"critical",concept:"La melancolía del narrador",text:"¿Por qué el narrador adulto no pudo encontrar al Principito cuando regresó al desierto?",options:["Porque el Principito fue a otro planeta","Porque el Principito ya no tenía cuerpo — solo quedaba la imagen en el desierto, inasequible para los adultos que no pueden ver sin los ojos del corazón","Porque el narrador llegó tarde","Porque fue un sueño"],correct:1,feedback:"El Principito regresó de la única manera posible. El narrador llora mirando el desierto — perdió algo que no puede recuperarse.",feedbackAlt:"Este final no es triste ni feliz. Es la verdad: algunas despedidas son para siempre."},
      {difficulty:"hard",mode:"critical",concept:"La rosa como amor particular",text:"¿Qué dice la novela sobre la universalidad del amor vs. el amor a lo particular?",options:["Que el amor universal es más noble que el amor específico","Que el amor genuino no es abstracto — se ama a esta persona, a esta rosa, no al amor en general. Lo universal se alcanza a través de lo particular","Que todos los seres amados son intercambiables","Que el amor debe repartirse equitativamente entre todos"],correct:1,feedback:"El jardín de cinco mil rosas no reemplaza a su rosa porque el amor no es intercambiable — creció a partir de un vínculo específico.",feedbackAlt:"Esta es una de las afirmaciones más profundas de la novela: lo universal se alcanza a través de lo particular, no a pesar de él."},
      {difficulty:"hard",mode:"critical",concept:"El libro como advertencia",text:"¿A qué adultos específicamente dirige su crítica Saint-Exupéry en el libro?",options:["A los malos padres","A los que se volvieron tan funcionales, racionalizadores y cuantificadores que ya no pueden ver lo esencial — y a su vez, a todos nosotros cuando reproducimos esos patrones","Solo a los políticos y personas de poder","A los hombres de negocios en particular"],correct:1,feedback:"Saint-Exupéry no ataca a personas malas sino a personas funcionales que perdieron algo importante en el proceso de 'crecer'.",feedbackAlt:"La critica más dura es la que se dirige no a los monstruos sino a la gente ordinaria que simplemente olvidó."},
      {difficulty:"hard",mode:"highlight",concept:"La responsabilidad del amor",text:"Subraya la frase que mejor captura la tesis central del libro sobre el amor y la responsabilidad:",fragment:"—Eres responsable para siempre de lo que has domesticado. Eres responsable de tu rosa.",correctHighlight:"Eres responsable para siempre de lo que has domesticado",options:["Eres responsable de tu rosa","Eres responsable para siempre de lo que has domesticado","El Zorro le dijo","lo esencial es invisible a los ojos"],correct:0,feedback:"El amor crea responsabilidad permanente. No puedes amar y luego abandonar — la domesticación es un compromiso.",feedbackAlt:"Esta es la ética del Principito: quien ama, se obliga."},
    ],
    flashcards:[
      {id:"fc1",front:"¿Cuál es la frase central del libro?",back:"'Lo esencial es invisible a los ojos. Solo se ve bien con el corazón.'"},
      {id:"fc2",front:"¿Qué representan los baobabs?",back:"Los malos pensamientos o vicios que deben combatirse cuando son pequeños."},
      {id:"fc3",front:"¿Por qué la Rosa del Principito es única?",back:"No por ser la más bella, sino porque él la ha cuidado y ella lo ha cuidado a él."},
      {id:"fc4",front:"¿Qué critica Saint-Exupéry con los planetas?",back:"Los vicios adultos: la autoridad vacía, la vanidad, la adicción, el conocimiento sin experiencia."},
    ],
    debatePrompts:[{id:"principito-d1",question:"¿El Principito es un libro para niños o para adultos?",context:"Está escrito para niños pero critica a los adultos. ¿Quién realmente necesita leerlo?"}],
    forumId:"principito-forum"
  },
  {
    id:"dorian", title:"El retrato de Dorian Gray", author:"Oscar Wilde", year:1890,
    genre:"Novela gótica", tagline:"La belleza es la única forma de genialidad.",
    color:"#2C4A2E", spine:"#1A2E1C", badgeIcon:"🖼️", badgeName:"Esteta",
    questions:[
      {difficulty:"easy",mode:"critical",concept:"El deseo de Dorian",text:"¿Qué petición formula Dorian Gray al ver el cuadro terminado?",options:["Quiere que le regalen el cuadro","Desea que el cuadro envejezca en su lugar mientras él permanece joven","Pide destruir el cuadro","Solicita que lo exhiban en una galería"],correct:1,feedback:"Dorian desea que el cuadro cargue con su envejecimiento y sus pecados.",feedbackAlt:"Este momento establece el pacto fáustico central de la novela."},
      {difficulty:"medium",mode:"critical",concept:"Lord Henry",text:"¿Cómo influye Lord Henry en Dorian?",options:["Lo protege de los excesos de la vida","Lo corrompe con una filosofía del placer sin consecuencias","Lo educa en valores morales sólidos","Lord Henry no tiene influencia significativa"],correct:1,feedback:"Lord Henry es el corruptor intelectual: seduce con palabras brillantes que destruyen la moral.",feedbackAlt:"Lord Henry planta las ideas que luego ve crecer en Dorian."},
      {difficulty:"hard",mode:"critical",concept:"El final",text:"¿Qué ocurre cuando Dorian apuñala el lienzo al final?",options:["El cuadro se destruye y Dorian queda libre","Dorian muere horriblemente envejecido y el cuadro recupera su belleza original","El cuadro permanece intacto","El cuadro se desvanece sin consecuencias"],correct:1,feedback:"Intentar destruir su conciencia lo destruye a él.",feedbackAlt:"No puedes destruir tu propia alma sin destruirte a ti mismo."},
      {difficulty:"easy",mode:"critical",concept:"Basil Hallward",text:"¿Quién es Basil Hallward y qué siente por Dorian?",options:["Es el director de una galería de arte","Es el pintor que crea el retrato y siente por Dorian una devoción que va más allá de la admiración artística","Es el maestro de Lord Henry","Es el padre adoptivo de Dorian"],correct:1,feedback:"Basil ama la belleza de Dorian con una intensidad que él mismo apenas puede explicar — ese amor es lo que da poder al retrato.",feedbackAlt:"La devoción de Basil es la fuente del cuadro: pintó su alma en el lienzo."},
      {difficulty:"easy",mode:"critical",concept:"Sibyl Vane",text:"¿Quién es Sibyl Vane y qué le ocurre?",options:["Es la esposa de Lord Henry","Es una actriz joven de la que Dorian se enamora, quien muere en circunstancias misteriosas después de que él la rechaza","Es la madre de Dorian","Es una pintora rival de Basil"],correct:1,feedback:"Sibyl muere (suicidio probablemente) después de que Dorian la rechaza cruelmente cuando actúa mal.",feedbackAlt:"Dorian la amaba como personaje ficticio; cuando ella dejó de actuar bien, la descartó como si fuera un objeto."},
      {difficulty:"easy",mode:"critical",concept:"La primera visión del retrato",text:"¿Por qué Dorian reacciona con horror al ver el retrato terminado?",options:["Porque cree que el cuadro está mal pintado","Porque se da cuenta de que él envejecerá mientras el cuadro permanecerá joven — siente envidia de su propia imagen","Porque el cuadro le parece demasiado realista","Porque no reconoce su propio rostro"],correct:1,feedback:"Ver la belleza fijada en el cuadro desencadena su deseo de invertir la relación: que él permanezca joven y el cuadro envejezca.",feedbackAlt:"Es el nacimiento del narcisismo fatal: quiere ser eterno y bello por encima de todo."},
      {difficulty:"easy",mode:"critical",concept:"El hedonismo",text:"¿Cuál es la filosofía que Lord Henry le enseña a Dorian?",options:["El estoicismo: soportar el sufrimiento sin quejarse","El hedonismo: el placer y la belleza son los únicos valores que importan; el tiempo es el enemigo","El altruismo: vivir para los demás","El puritanismo: la virtud moral por encima de todo"],correct:1,feedback:"Lord Henry convierte a Dorian en un hedonista radical: perseguir el placer sin culpa, adorar la belleza joven.",feedbackAlt:"Esta filosofía tiene consecuencias devastadoras — no porque sea falsa en todo, sino porque Dorian la aplica sin límites ni compasión."},
      {difficulty:"medium",mode:"critical",concept:"Lord Henry como corruptor",text:"¿Por qué Lord Henry nunca actúa directamente sino que solo habla y planta ideas?",options:["Porque es cobarde y prefiere evitar el peligro","Porque es el corruptor intelectual: siembra ideas sin responsabilizarse de sus consecuencias, usando a Dorian como experimento de su filosofía","Porque no tiene tiempo para actuar","Porque respeta demasiado a Dorian para influirlo"],correct:1,feedback:"Lord Henry es el intelectual sin consecuencias: teoriza el libertinaje pero vive tranquilamente mientras Dorian lleva la teoría a su extremo.",feedbackAlt:"La corrupción más peligrosa no viene con armas sino con palabras brillantes."},
      {difficulty:"medium",mode:"critical",concept:"El retrato como conciencia",text:"¿Qué representa el retrato en términos psicológicos?",options:["La memoria de la juventud de Dorian","La externalización de su conciencia moral: el cuadro registra lo que Dorian niega internamente","Un elemento sobrenatural sin significado psicológico","La visión que los demás tienen de Dorian"],correct:1,feedback:"Dorian puede ignorar su conciencia porque la tiene pintada en un lienzo que puede esconder — pero sigue existiendo.",feedbackAlt:"El cuadro es lo que todos llevamos adentro pero que Dorian logró externalizar y ocultar."},
      {difficulty:"medium",mode:"critical",concept:"James Vane",text:"¿Qué función cumple James Vane en la novela?",options:["Es el amigo más cercano de Dorian","Es el hermano de Sibyl que busca vengarse de Dorian, representando la justicia moral que Dorian evade","Es el pintor rival de Basil","Es el abogado que gestiona la fortuna de Dorian"],correct:1,feedback:"James es la amenaza de consecuencias reales: Dorian puede esquivar la responsabilidad moral pero la venganza humana es más concreta.",feedbackAlt:"Su muerte accidental demuestra que Dorian tiene suerte, no inocencia."},
      {difficulty:"medium",mode:"fragment",concept:"El arte amoral de Wilde",text:"¿Qué postura sobre el arte revela este prefacio?",fragment:"No hay libros morales ni libros inmorales. Hay libros bien escritos y libros mal escritos. Eso es todo. Los victorianos que en el libro encontraron la corrupción son ellos quienes son los corruptos.",options:["Que Wilde defendía la pornografía","Que el arte existe fuera de la moral: su valor es estético, no ético; quien ve corrupción en él la trae consigo","Que los victorianos tenían razón en censurar el libro","Que Wilde era un nihilista moral"],correct:1,feedback:"Wilde provocó deliberadamente: el arte no tiene obligaciones morales. El lector que se corrompe trae la corrupción.",feedbackAlt:"Esta postura provocó el escándalo victoriano — y también fue usada en su contra en el juicio por el que fue encarcelado."},
      {difficulty:"medium",mode:"critical",concept:"La muerte de Basil",text:"¿Por qué Dorian mata a Basil cuando le muestra el cuadro?",options:["Por robo de su patrimonio","Porque Basil, al ver el horror del retrato, es el espejo que Dorian no puede soportar — lo mata para no enfrentar lo que se ha vuelto","Porque Basil amenazaba con revelar su secreto a la sociedad","Por un acceso de locura repentina"],correct:1,feedback:"Basil ve el alma real de Dorian y lo confronta. Dorian lo mata por no poder tolerar ese conocimiento.",feedbackAlt:"El creador del retrato muere a manos de quien lo inspiró — la ironía es perfecta."},
      {difficulty:"hard",mode:"critical",concept:"Wilde y el juicio",text:"¿Cómo se relaciona la vida de Oscar Wilde con los temas de la novela?",options:["Wilde era un moralista convencional que criticaba a Dorian desde fuera","Wilde vivió sus propias consecuencias: su vida abiertamente homosexual y su filosofía estética lo llevaron a la cárcel, como Dorian es destruido por vivir sin límites morales","La novela es completamente autobiográfica","Wilde no tenía relación personal con los temas del libro"],correct:1,feedback:"Wilde fue encarcelado por 'indecencia grave'. Su vida y su novela son inseparables: ambas hablan del precio de vivir fuera de las convenciones.",feedbackAlt:"Dorian es la versión ficticia de los peligros que Wilde enfrentó realmente."},
      {difficulty:"hard",mode:"critical",concept:"Belleza y moralidad",text:"¿Qué dice la novela sobre la relación entre belleza exterior y bondad interior?",options:["Que los bellos son siempre buenos","Que la belleza exterior puede ocultar — y eventualmente corromperse por — la podredumbre moral interior","Que la belleza y la moralidad son completamente independientes","Que los feos son más virtuosos que los bellos"],correct:1,feedback:"El cuadro demuestra que la belleza de Dorian es una mentira estructural — su exterior no corresponde a su interior.",feedbackAlt:"La novela subvierte el ideal victoriano de que la virtud y la belleza van de la mano."},
      {difficulty:"medium",mode:"critical",concept:"El opio de la sociedad victoriana",text:"¿Qué critica Wilde a la sociedad victoriana a través de Dorian?",options:["La hipocresía religiosa de los victorianos","La hipocresía moral: una sociedad que en público defiende la virtud pero en privado busca el placer y vuelve la vista ante el pecado de los privilegiados","La pobreza de la clase trabajadora","La falta de libertad artística"],correct:1,feedback:"Wilde conocía perfectamente la hipocresía victoriana: era parte de ella y la sufrió.",feedbackAlt:"Dorian puede hacer lo que hace porque la sociedad mira para otro lado cuando el culpable es bello y rico."},
      {difficulty:"hard",mode:"critical",concept:"El nombre perdido",text:"¿Por qué la criatura de Frankenstein no tiene nombre en la novela?",options:["Porque Mary Shelley olvidó nombrarlo","Porque no tener nombre es la primera violencia de Victor: sin nombre, no tiene identidad ni lugar en el mundo — su anonimato es el símbolo de su abandono","Porque las criaturas sobrenaturales no tienen nombre","Porque Shelley quería que el lector lo nombrara"],correct:1,feedback:"La criatura conocida popularmente como 'Frankenstein' no tiene nombre en la novela. Ese vacío nominal es la primera herida.",feedbackAlt:"Sin nombre, no se puede reclamar existencia. Frankenstein niega a su creación hasta este derecho básico."},
      {difficulty:"hard",mode:"critical",concept:"El prefacio como escudo y provocación",text:"¿Qué función cumple el prefacio de Wilde ('No hay libros morales ni inmorales...') respecto al contenido de la novela?",options:["Es una introducción literaria convencional","Es tanto un escudo legal como una provocación: Wilde declara que el arte no puede ser juzgado moralmente mientras escribe precisamente una novela sobre las consecuencias morales de una vida de placer sin límites","Es una contradicción del contenido de la novela","Es un texto separado sin relación con la novela"],correct:1,feedback:"La paradoja de Wilde: escribe sobre consecuencias morales mientras argumenta que el arte es amoral. La tensión es intencional.",feedbackAlt:"Wilde sabía que el libro sería atacado — el prefacio era la respuesta preparada de antemano."},
      {difficulty:"hard",mode:"critical",concept:"El hedonismo y sus límites",text:"¿La novela condena el hedonismo o simplemente muestra sus consecuencias?",options:["Condena el hedonismo sin matices","Muestra que el hedonismo sin conciencia ni compasión destruye al que lo practica y a los que lo rodean — no lo condena moralmente sino que demuestra su inviabilidad práctica","Celebra el hedonismo como ideal de vida","No tiene postura sobre el hedonismo"],correct:1,feedback:"Wilde no predica: muestra. Dorian no es castigado por una moralidad exterior sino por la lógica interna de su propia elección.",feedbackAlt:"Es la diferencia entre una fábula moral y una novela de consecuencias. Wilde escribe la segunda."},
      {difficulty:"hard",mode:"highlight",concept:"El arte como espejo",text:"Subraya la frase que mejor captura la naturaleza del retrato como registro moral:",fragment:"El retrato guardaba el secreto de su vida y le contaba su historia. Le había enseñado a amar su propia belleza. ¿Le enseñaría a odiar su propia alma?",correctHighlight:"¿Le enseñaría a odiar su propia alma?",options:["El retrato guardaba el secreto de su vida","Le había enseñado a amar su propia belleza","le contaba su historia","¿Le enseñaría a odiar su propia alma?"],correct:3,feedback:"La pregunta retórica es la tesis: el narcisismo que lo salvó de envejecer eventualmente lo obliga a confrontar lo que se volvió.",feedbackAlt:"Amar la propia belleza es el primer paso; ver la propia monstruosidad moral es el siguiente y último."},
    ],
    flashcards:[
      {id:"fc1",front:"¿Cuál es el pacto fáustico de Dorian Gray?",back:"Desea que el retrato envejezca y cargue sus pecados mientras él permanece joven y bello."},
      {id:"fc2",front:"¿Qué representa el retrato?",back:"El alma de Dorian: registra cada pecado moral mientras su cara permanece inmaculada."},
      {id:"fc3",front:"¿Qué papel cumple Lord Henry?",back:"El corruptor intelectual: seduce con filosofía del placer sin actuar directamente."},
      {id:"fc4",front:"¿Qué ocurre cuando Dorian apuñala el cuadro?",back:"Muere horriblemente envejecido. No puedes destruir tu alma sin destruirte a ti mismo."},
    ],
    debatePrompts:[{id:"dorian-d1",question:"¿Es Dorian Gray víctima de Lord Henry o responsable de sus propias elecciones?",context:"Lord Henry lo sedujo con ideas. Pero Dorian eligió vivir según ellas. ¿Dónde está la responsabilidad?"}],
    forumId:"dorian-forum"
  },
  {
    id:"fahrenheit", title:"Fahrenheit 451", author:"Ray Bradbury", year:1953,
    genre:"Distopía / Ciencia ficción", tagline:"La temperatura a la que arde el papel.",
    color:"#A0390E", spine:"#7A2B0A", badgeIcon:"🔥", badgeName:"Bombero",
    questions:[
      {difficulty:"easy",mode:"critical",concept:"Montag",text:"¿Cuál es el trabajo de Guy Montag al inicio de la novela?",options:["Es un lector clandestino","Es bombero: su trabajo es quemar libros, no apagar incendios","Es bibliotecario del gobierno","Es un soldado de la resistencia"],correct:1,feedback:"En este mundo, los bomberos no apagan incendios: los provocan para quemar libros prohibidos.",feedbackAlt:"Esta inversión del rol del bombero establece inmediatamente la naturaleza distópica del mundo."},
      {difficulty:"medium",mode:"critical",concept:"Clarisse",text:"¿Qué papel cumple Clarisse McClellan en el despertar de Montag?",options:["Es su enemiga que lo denuncia","Es una vecina joven que lo hace cuestionar su mundo con preguntas simples y directas","Es una agente del gobierno disfrazada","Es su jefa en el cuerpo de bomberos"],correct:1,feedback:"Clarisse hace a Montag la pregunta más simple y devastadora: '¿Eres feliz?'.",feedbackAlt:"Su naturaleza curiosa contrasta con la sociedad de entretenimiento superficial."},
      {difficulty:"hard",mode:"critical",concept:"Los libros vivos",text:"¿Qué solución encuentran los rebeldes para preservar el conocimiento sin libros físicos?",options:["Microfilman los libros","Memorizan libros enteros y se convierten ellos mismos en las obras que preservan","Usan un sistema de radio clandestino","Guardan libros en el campo magnético de una montaña"],correct:1,feedback:"Los 'hombres-libro' memorizan obras completas: se convierten en la memoria viva de la humanidad.",feedbackAlt:"Esta solución une la resistencia intelectual con la identidad humana."},
      {difficulty:"easy",mode:"critical",concept:"La sociedad televisiva",text:"¿Cómo pasa el tiempo la gente en la sociedad de Fahrenheit 451?",options:["Leyendo y estudiando en casa","Viendo televisión interactiva en pantallas gigantes que cubren las paredes, sin reflexión ni pensamiento","Trabajando doce horas diarias","Practicando deportes colectivos obligatorios"],correct:1,feedback:"Las 'paredes televisivas' reemplazan las relaciones reales y el pensamiento con entretenimiento constante.",feedbackAlt:"Bradbury anticipó décadas antes los efectos de la televisión y los medios de consumo masivo."},
      {difficulty:"easy",mode:"critical",concept:"Mildred",text:"¿Cómo es la esposa de Montag, Mildred, y qué representa?",options:["Es una compañera comprometida que apoya el despertar de Montag","Es el símbolo del ciudadano completamente absorbido por el sistema: adicta a la televisión, desconectada de la realidad y sin vida interior","Es una agente del gobierno que vigila a Montag","Es una profesora que fue despedida por leer libros"],correct:1,feedback:"Mildred casi muere de sobredosis de pastillas y al día siguiente no recuerda nada — es la consecuencia última de la sociedad del entretenimiento.",feedbackAlt:"Su vacío interior contrasta directamente con la vida que Clarisse tiene plenamente."},
      {difficulty:"easy",mode:"critical",concept:"El capitán Beatty",text:"¿Qué postura tiene el capitán Beatty sobre los libros?",options:["Los odia porque son difíciles de entender","Irónicamente, los ha leído todos: argumenta que los libros hacen a las personas infelices y que quemarlos es un servicio a la sociedad","Es un ignorante que nunca leyó un libro en su vida","Secretamente conserva libros en casa como Montag"],correct:1,feedback:"Beatty es el personaje más complejo: conoce la literatura y aun así defiende su destrucción.",feedbackAlt:"Un hombre educado que usa su conocimiento para justificar la censura es más peligroso que un ignorante."},
      {difficulty:"easy",mode:"critical",concept:"El perro mecánico",text:"¿Qué es el perro mecánico y para qué sirve?",options:["Una mascota robótica para los bomberos","Un dispositivo de vigilancia y cacería programado para perseguir y eliminar a los que guardan libros","Un símbolo del avance tecnológico positivo","Un juguete para niños en la sociedad del futuro"],correct:1,feedback:"El perro mecánico es la versión tecnológica de la represión: implacable, sin compasión, perfectamente programado para destruir.",feedbackAlt:"Bradbury lo usa para mostrar cómo la tecnología puede convertirse en instrumento perfecto del autoritarismo."},
      {difficulty:"medium",mode:"critical",concept:"Faber",text:"¿Qué papel cumple Faber en el despertar de Montag?",options:["Es un bombero reformado que se convirtió en rebelde","Es un profesor retirado que posee libros secretamente y guía intelectualmente a Montag, representando el conocimiento que sobrevive en las sombras","Es el líder de los hombres-libro en el bosque","Es el escritor del libro que Montag encontró"],correct:1,feedback:"Faber es el puente: tiene el conocimiento pero no el coraje de actuar solo. Montag tiene el coraje pero le falta el conocimiento.",feedbackAlt:"Juntos forman lo que ninguno puede ser individualmente."},
      {difficulty:"medium",mode:"critical",concept:"La censura como comodidad",text:"¿Cómo explica el capitán Beatty el origen de la quema de libros?",options:["El gobierno lo ordenó para mantener el poder político","Los propios ciudadanos empezaron a quejarse de que los libros los hacían infelices o los ofendían, y la sociedad encontró más cómodo eliminarlos","Una guerra destruyó todas las bibliotecas y la sociedad adaptó la pérdida","Un grupo religioso convenció al gobierno de la peligrosidad de los libros"],correct:1,feedback:"La censura no nació del autoritarismo sino de la demanda popular de comodidad y ausencia de contradicción.",feedbackAlt:"Bradbury advierte: los regímenes censores a veces tienen colaboración voluntaria de los censurados."},
      {difficulty:"medium",mode:"fragment",concept:"Velocidad y vacío",text:"¿Qué critica Bradbury a través de la velocidad en este pasaje?",fragment:"Los carteles en las carreteras tenían que ser enormes para que los conductores pudieran leerlos a 150 km/h. No había tiempo para pensar. Solo para ver y seguir adelante.",options:["La mala infraestructura vial","La velocidad como instrumento de vaciamiento intelectual: si todo va demasiado rápido, no hay tiempo para reflexionar","La ineficiencia del transporte público","El tamaño excesivo de los anuncios publicitarios"],correct:1,feedback:"La velocidad elimina la posibilidad de reflexión. Una sociedad acelerada es una sociedad sin pensamiento crítico.",feedbackAlt:"Bradbury anticipó la economía de la atención: cuando todo se consume rápido, nada se digiere."},
      {difficulty:"medium",mode:"critical",concept:"La bomba atómica",text:"¿Qué papel cumple la guerra nuclear al final de la novela?",options:["Destruye al régimen y libera a Montag","Destruye la ciudad donde vivía Montag mientras él ya ha escapado — es el colapso inevitable de una sociedad que no pensaba","Es el plan de los hombres-libro para resetear la civilización","Muere Mildred en la explosión como castigo narrativo"],correct:1,feedback:"La guerra es la consecuencia natural: una sociedad que no piensa no puede evitar destruirse a sí misma.",feedbackAlt:"Bradbury conecta la censura con la autodestrucción: sin pensamiento crítico, las civilizaciones se eliminan."},
      {difficulty:"hard",mode:"critical",concept:"La tesis central de Bradbury",text:"¿Qué advierte Bradbury sobre la tecnología y el entretenimiento masivo?",options:["Que la tecnología es inevitablemente buena para la humanidad","Que el entretenimiento constante puede hacer lo que ninguna dictadura pudo: apagar voluntariamente el pensamiento crítico de los ciudadanos","Que debemos eliminar toda tecnología","Que los libros son superiores a todas las formas de media"],correct:1,feedback:"Bradbury no culpa al gobierno en primer lugar — culpa a la sociedad que prefirió la comodidad al pensamiento.",feedbackAlt:"Es una advertencia sobre la colusión voluntaria: la censura más efectiva es la que hacemos nosotros mismos."},
      {difficulty:"hard",mode:"critical",concept:"Beatty y la ironía",text:"¿Qué hace irónica la muerte del capitán Beatty a manos de Montag?",options:["Beatty nunca esperaba que Montag se rebelara","Beatty provoca deliberadamente su propia muerte — era un hombre destrozado por conocer el valor de los libros y no poder defenderlos; quería que lo mataran","Beatty murió por accidente","Montag mató a Beatty por ordenes de la resistencia"],correct:1,feedback:"Beatty es el nihilista más trágico: conoce la belleza de los libros y elige destruirlos. Su muerte parece buscada.",feedbackAlt:"La profundidad de Beatty lo convierte en más que un villano — es un hombre que eligió el nihilismo conscientemente."},
      {difficulty:"medium",mode:"critical",concept:"La televisión como sustituto",text:"¿Qué dice Bradbury sobre las 'familias televisivas' a las que Mildred se refiere como 'mis primos'?",options:["Que la televisión puede crear vínculos genuinos","Que las relaciones virtuales pueden reemplazar las reales cuando estas son demasiado dolorosas — pero ese reemplazo es un vaciamiento de la humanidad","Que la televisión es inofensiva","Que Mildred simplemente tiene mucha imaginación"],correct:1,feedback:"Mildred llama 'familia' a personajes de pantalla mientras ignora a su esposo real. Bradbury muestra que es más fácil amar lo que no puede herirte.",feedbackAlt:"Esta dinámica es especialmente relevante en la era de las redes sociales."},
      {difficulty:"medium",mode:"critical",concept:"La curiosidad prohibida",text:"¿Por qué la curiosidad de Montag es peligrosa en su sociedad?",options:["Porque lo hace cometer errores en su trabajo","Porque la sociedad solo puede existir si nadie pregunta '¿por qué?' — las preguntas generan comparaciones y las comparaciones generan insatisfacción","Porque su jefe lo observa","Porque los libros que lee son explosivos"],correct:1,feedback:"Beatty lo explica: los libros hacen que las personas comparen su vida con otras posibles. La comparación genera descontento.",feedbackAlt:"La pregunta '¿podría ser diferente?' es la más peligrosa en una sociedad que no quiere cambiar."},
      {difficulty:"hard",mode:"critical",concept:"La censura suave vs. dura",text:"¿Qué diferencia establece Bradbury entre la censura de Fahrenheit y la de 1984?",options:["No hay diferencia conceptual entre ambas","En 1984 el Estado impone el terror; en Fahrenheit 451 la gente pidió la censura por comodidad — la segunda es más aterradora porque no hay quién rescatar","En Fahrenheit el gobierno es más violento","En 1984 hay libros permitidos"],correct:1,feedback:"Bradbury advierte sobre la autocensura voluntaria: cuando la sociedad misma renuncia al pensamiento, no se necesita un dictador.",feedbackAlt:"Es la misma distinción que hace Huxley: la jaula más dura de romper es la que uno construye desde adentro."},
      {difficulty:"hard",mode:"critical",concept:"La poesía como arma",text:"¿Por qué Montag llora cuando lee un poema a las mujeres de la sala de televisión?",options:["Por la tristeza del poema en particular","Porque el poema toca algo en las mujeres que el entretenimiento nunca puede tocar — esa grieta en su armor de indiferencia demuestra que el arte tiene poder que el soma del entretenimiento no puede eliminar completamente","Por nostalgia de su propio pasado","Porque era un poema sobre su madre"],correct:1,feedback:"Las mujeres lloran sin entender por qué — el arte las alcanza debajo del condicionamiento. Esa vulnerabilidad es la esperanza.",feedbackAlt:"Bradbury muestra que la capacidad de ser conmovido no desaparece completamente incluso en la sociedad más anestesiada."},
      {difficulty:"hard",mode:"critical",concept:"La reconstrucción después del fuego",text:"¿Qué simboliza la ciudad destruida por las bombas y los hombres-libro esperando reconstruir?",options:["El fracaso total de la humanidad","La esperanza de que el conocimiento sobrevive a la destrucción: desde las ruinas, los portadores de libros pueden comenzar de nuevo","El pesimismo de Bradbury sobre la civilización","Una metáfora de la Segunda Guerra Mundial solamente"],correct:1,feedback:"El fuego destruye pero también purifica. Los hombres-libro son la simiente que espera el momento de germinar.",feedbackAlt:"Bradbury termina con esperanza, no con derrota: mientras exista alguien que recuerde, no todo está perdido."},
      {difficulty:"hard",mode:"highlight",concept:"El libro como persona",text:"Subraya la frase que mejor captura la humanización del conocimiento en la resistencia:",fragment:"Soy el Libro del Eclesiastés —dijo Granger—. Dentro de un año pasaré a mi hijo lo que sé. No somos páginas, somos personas. Y cuando morimos, los libros no mueren con nosotros.",correctHighlight:"No somos páginas, somos personas",options:["Soy el Libro del Eclesiastés","No somos páginas, somos personas","cuando morimos, los libros no mueren con nosotros","pasaré a mi hijo lo que sé"],correct:1,feedback:"Los hombres-libro son personas que encarnan el conocimiento — la resistencia se vuelve inseparable de la humanidad.",feedbackAlt:"Esta fusión de persona y libro es la respuesta definitiva a los que queman papel: no pueden quemar a las personas."},
    ],
    flashcards:[
      {id:"fc1",front:"¿Qué hace un bombero en Fahrenheit 451?",back:"Quema libros, no apaga incendios. El fuego es una herramienta de censura, no de protección."},
      {id:"fc2",front:"¿Qué pregunta hace Clarisse que cambia a Montag?",back:"'¿Eres feliz?' Una pregunta simple que destruye la complacencia de Montag."},
      {id:"fc3",front:"¿Qué son los 'hombres-libro'?",back:"Rebeldes que memorizan obras literarias enteras para preservarlas cuando los libros físicos son destruidos."},
      {id:"fc4",front:"¿Qué significa '451 Fahrenheit'?",back:"La temperatura a la que el papel de los libros arde y se quema."},
    ],
    debatePrompts:[{id:"fahrenheit-d1",question:"¿La sociedad de Fahrenheit 451 quema libros por miedo o por ignorancia?",context:"El capitán Beatty argumenta que los libros hacen a las personas infelices. ¿Es el gobierno el verdadero enemigo o es la indiferencia de la gente?"}],
    forumId:"fahrenheit-forum"
  },
  {
    id:"cien", title:"Cien años de soledad", author:"Gabriel García Márquez", year:1967,
    genre:"Realismo mágico", tagline:"Las familias condenadas a cien años de soledad no tienen segunda oportunidad.",
    color:"#7A5C1A", spine:"#5C4510", badgeIcon:"🦋", badgeName:"Solitario",
    questions:[
      {difficulty:"easy",mode:"critical",concept:"Macondo",text:"¿Qué tipo de lugar es Macondo?",options:["Una ciudad real de Colombia","Un pueblo ficticio fundado por José Arcadio Buendía que representa toda la historia latinoamericana","Un país imaginario sin relación con la realidad","Un lugar en el futuro distópico"],correct:1,feedback:"Macondo es el microcosmos de toda Latinoamérica.",feedbackAlt:"García Márquez construye Macondo como síntesis del mundo latinoamericano."},
      {difficulty:"medium",mode:"critical",concept:"La soledad como tema",text:"¿Qué simboliza la 'soledad' como tema central?",options:["El aislamiento físico de Macondo","La incapacidad de los Buendía de conectar genuinamente entre sí y con el mundo","La pobreza extrema de los personajes","El rechazo de los demás pueblos hacia Macondo"],correct:1,feedback:"La soledad de los Buendía es existencial: cada uno está encerrado en sí mismo.",feedbackAlt:"García Márquez muestra que la soledad se hereda."},
      {difficulty:"hard",mode:"critical",concept:"El realismo mágico",text:"¿Cómo funciona el realismo mágico en la novela?",options:["Los personajes saben que viven en un mundo mágico y lo comentan","Los eventos sobrenaturales se narran con la misma naturalidad que los cotidianos, sin distinción","Es un código secreto para hablar de la realidad política","Solo ocurre en los capítulos impares"],correct:1,feedback:"El genio de García Márquez: lo maravilloso y lo ordinario coexisten sin jerarquía ni sorpresa.",feedbackAlt:"Esta técnica refleja la percepción latinoamericana donde lo real y lo extraordinario no están completamente separados."},
      {difficulty:"easy",mode:"critical",concept:"José Arcadio Buendía",text:"¿Quién funda Macondo y qué lo caracteriza?",options:["Un guerrero que conquista el territorio","José Arcadio Buendía, un hombre obsesionado con los descubrimientos científicos y la búsqueda del conocimiento que termina enloqueciendo","Un líder político que escapa de la ciudad","Un comerciante que establece una ruta comercial"],correct:1,feedback:"El fundador de Macondo es a la vez visionario y loco: su obsesión por el conocimiento lo destruye.",feedbackAlt:"García Márquez establece desde el inicio que la búsqueda sin límites del conocimiento tiene un precio."},
      {difficulty:"easy",mode:"critical",concept:"Los nombres repetidos",text:"¿Por qué los Buendía repiten los nombres en cada generación?",options:["Por tradición cultural colombiana","Para mostrar que cada generación repite los mismos errores y la misma soledad — los nombres son el símbolo del ciclo inevitables","Por descuido del autor","Para honrar a los antepasados"],correct:1,feedback:"José Arcadio y Aureliano se repiten a través de las generaciones, cada uno con sus obsesiones específicas pero los mismos destinos.",feedbackAlt:"Los nombres son el mapa del ciclo: si conoces el nombre, ya sabes algo del destino."},
      {difficulty:"easy",mode:"critical",concept:"El insomnio y el olvido",text:"¿Qué plaga ataca a Macondo al inicio y qué consecuencia simbólica tiene?",options:["Una plaga de langostas que destruye los cultivos","La plaga del insomnio que lleva al olvido: los habitantes deben etiquetar todo para recordar qué son las cosas","Una epidemia de fiebre tropical","Una plaga de mariposas amarillas"],correct:1,feedback:"La plaga del insomnio y el olvido es una metáfora de la memoria colectiva frágil: sin memoria, la identidad se disuelve.",feedbackAlt:"García Márquez anticipa aquí el tema central de toda la novela: la soledad como pérdida de conexión con la historia."},
      {difficulty:"easy",mode:"critical",concept:"Úrsula Iguarán",text:"¿Cuál es el papel de Úrsula en la familia Buendía?",options:["Es la antagonista que frena el desarrollo de la familia","Es el eje materno que mantiene unida a la familia durante generaciones, representando la memoria y la continuidad","Es una figura secundaria sin importancia","Es la primera persona que abandona Macondo"],correct:1,feedback:"Úrsula vive más de cien años y es el hilo conductor de toda la historia: mientras vive, la familia tiene un centro.",feedbackAlt:"Su muerte marca el inicio del fin de Macondo."},
      {difficulty:"medium",mode:"critical",concept:"Las guerras civiles",text:"¿Qué representan las múltiples guerras civiles del coronel Aureliano Buendía?",options:["El heroísmo militar como virtud suprema","La inutilidad de la violencia política: Aureliano hace 32 guerras y las pierde todas, sin que nada cambie realmente","La lucha por la justicia que finalmente triunfa","La corrupción del gobierno conservador colombiano"],correct:1,feedback:"Aureliano lucha 32 veces y todo permanece igual. García Márquez muestra que la violencia política es un ciclo sin salida.",feedbackAlt:"Las guerras representan la historia real de Colombia y Latinoamérica: ciclos de violencia que no transforman."},
      {difficulty:"medium",mode:"critical",concept:"La compañía bananera",text:"¿Qué representa la llegada de la compañía bananera a Macondo?",options:["El progreso económico que beneficia a todos","El imperialismo económico extranjero que explota y luego abandona, dejando solo destrucción","Una empresa local que trae prosperidad","El inicio de la modernización de Macondo"],correct:1,feedback:"La masacre de trabajadores y el abandono posterior reflejan la historia del imperialismo en Latinoamérica.",feedbackAlt:"García Márquez narra una versión ficticia de hechos reales: las bananeras fueron empresas reales con historias similares en Colombia."},
      {difficulty:"medium",mode:"fragment",concept:"La memoria y el olvido",text:"¿Qué critica este pasaje sobre la historia y el poder?",fragment:"Años después, cuando alguien preguntó por la masacre, los oficiales respondieron que no había ocurrido. No había muertos. No había habido huelga. Macondo era feliz.",options:["Que los testigos exageran los eventos","Que el poder puede borrar la historia oficial y hacer desaparecer lo que ocurrió: si no se registra, no existió","Que los macondinos tenían mala memoria","Que la violencia nunca ocurrió en la novela"],correct:1,feedback:"García Márquez describe el mecanismo real de la negación histórica: el poder que borra sus propios crímenes.",feedbackAlt:"Esto ocurrió en la historia real de Colombia con la United Fruit Company."},
      {difficulty:"medium",mode:"critical",concept:"El incesto y el destino",text:"¿Qué función tiene el motivo del incesto en la familia Buendía?",options:["Es un elemento de horror sin más significado","Es la advertencia de la gitana Pilar: el incesto como metáfora del encierro en sí mismos, la soledad que impide la conexión genuina con el mundo exterior","Es solo un error accidental","Representa la pureza de la sangre familiar"],correct:1,feedback:"El incesto es el símbolo extremo de la soledad de los Buendía: incapaces de salir de sí mismos, incluso en el amor.",feedbackAlt:"La amenaza del niño con cola de cerdo es la advertencia de que el ciclo tiene un límite: el fin absoluto."},
      {difficulty:"hard",mode:"critical",concept:"Los manuscritos de Melquíades",text:"¿Qué revelan los manuscritos de Melquíades al final y qué significa narrativamente?",options:["Son recetas de alquimia sin importancia narrativa","Son la novela misma, escrita en sánscrito — Aureliano lee su propia historia y la de Macondo mientras el viento bíblico la destruye","Son profecías sobre el futuro de Colombia","Son el diario personal de Melquíades"],correct:1,feedback:"El momento en que Aureliano lee los manuscritos y descubre que está leyendo la historia es una mise en abyme: la novela contiene su propia historia.",feedbackAlt:"García Márquez construye una arquitectura circular perfecta: la novela termina cuando el último Buendía termina de leerla."},
      {difficulty:"hard",mode:"critical",concept:"El realismo mágico como crítica política",text:"¿Por qué García Márquez usa el realismo mágico para narrar la historia política de Colombia?",options:["Porque no quería ser directo sobre los eventos reales","Porque el realismo mágico permite decir verdades políticas disfrazadas de fantasía, protegiendo al autor y haciendo la crítica más universal","Porque no conocía la historia colombiana bien","Porque el género fantástico era más popular"],correct:1,feedback:"El realismo mágico no es evasión: es una estrategia para contar la verdad de forma que pueda decirse sin ser censurada y que resuene más profundamente.",feedbackAlt:"García Márquez dijo: 'Todo lo que escribí ya ocurrió en Latinoamérica.'"},
      {difficulty:"medium",mode:"critical",concept:"El miedo a la maldición",text:"¿Por qué los Buendía temen que su descendencia nazca con cola de cerdo?",options:["Por una superstición religiosa sin base real","Porque el incesto que podría engendrar ese niño representa el límite del encierro de los Buendía en sí mismos — la maldición es la metáfora de la autodestrucción del linaje","Porque en el pueblo hubo un niño así","Por razones genéticas que García Márquez explica"],correct:1,feedback:"La cola de cerdo es la advertencia de que el ciclo de soledad tiene un fin biológico y definitivo.",feedbackAlt:"El encierro en uno mismo eventualmente destruye la capacidad de continuar."},
      {difficulty:"medium",mode:"critical",concept:"El coronel sin nombre",text:"¿Por qué el texto dice 'el coronel no tenía quien le escribiera'?",options:["Porque el coronel era analfabeto","Porque es una novela corta diferente, pero el tema de la soledad del coronel Aureliano Buendía que espera lo que nunca llega es central en todo el universo de Macondo","Porque fue una frase añadida como error","No aparece en la novela"],correct:1,feedback:"La soledad del Coronel Aureliano Buendía que espera su pensión de guerra que nunca llega es el símbolo de la traición de los ideales en la vejez.",feedbackAlt:"García Márquez volvió al mismo mundo varias veces porque el tema de la soledad le parecía inagotable."},
      {difficulty:"hard",mode:"critical",concept:"El circo de los gitanos",text:"¿Qué representan los gitanos de Melquíades y sus visitas a Macondo?",options:["Son personajes menores sin función simbólica","Representan el conocimiento externo que llega a Macondo: la ciencia, la escritura, la memoria — son el vínculo entre lo local y lo universal","Son los antagonistas de la historia","Son una referencia histórica a los gitanos reales de Colombia"],correct:1,feedback:"Melquíades trae el hielo, los imanes, los manuscritos — cada visita es una expansión de la conciencia de Macondo.",feedbackAlt:"El gitano es la figura del conocimiento que viene de afuera y enriquece lo que está adentro."},
      {difficulty:"hard",mode:"critical",concept:"La masacre de las bananeras",text:"¿Por qué García Márquez incluye la masacre de trabajadores bananeros y su posterior negación?",options:["Para añadir dramatismo a la trama","Porque describe un evento histórico real que el gobierno colombiano negó oficialmente — la novela es también un acto de memoria contra el olvido institucional","Para criticar a las empresas multinacionales en general","Porque necesitaba un evento violento en la trama"],correct:1,feedback:"La masacre de las bananeras (1928) ocurrió realmente. Al narrarla y mostrar su negación oficial, García Márquez escribe contra el borrado histórico.",feedbackAlt:"La novela no es solo ficción — es también testimonio de lo que el poder quiso que se olvidara."},
      {difficulty:"hard",mode:"critical",concept:"La estructura circular",text:"¿Cómo funciona la estructura circular de la novela y qué significa?",options:["Es solo un recurso narrativo sin significado","La novela comienza donde termina: Aureliano lee los manuscritos que narran exactamente lo que está ocurriendo — el tiempo es un círculo, el destino ya estaba escrito desde antes de que comenzara","Es una estructura lineal con un final abierto","García Márquez no tenía otra forma de terminar la historia"],correct:1,feedback:"El círculo temporal es la tesis: los Buendía no aprenden de su historia porque no pueden leerla hasta que es demasiado tarde.",feedbackAlt:"El tiempo circular en García Márquez no es poético — es la condena concreta de la familia."},
      {difficulty:"hard",mode:"highlight",concept:"La condena de los Buendía",text:"Subraya la frase que mejor captura el destino de toda la familia:",fragment:"Las razas condenadas a cien años de soledad no tenían una segunda oportunidad sobre la tierra.",correctHighlight:"Las razas condenadas a cien años de soledad no tenían una segunda oportunidad sobre la tierra",options:["cien años de soledad","no tenían una segunda oportunidad","Las razas condenadas a cien años de soledad no tenían una segunda oportunidad sobre la tierra","sobre la tierra"],correct:2,feedback:"La frase final de la novela es el epitafio de toda la saga: la soledad no es accidental, es un destino que se construyó generación tras generación.",feedbackAlt:"García Márquez no da esperanza fácil — la condena es real, y la novela es el testimonio de cómo se cumplió."},
    ],
    flashcards:[
      {id:"fc1",front:"¿Qué representa Macondo?",back:"Un microcosmos de Latinoamérica: sus ciclos de guerra, amor, soledad y olvido reflejan la historia del continente."},
      {id:"fc2",front:"¿Por qué los Buendía repiten sus nombres?",back:"Para mostrar que cada generación repite los errores de la anterior, atrapada en un ciclo de soledad."},
      {id:"fc3",front:"¿Qué es el realismo mágico de García Márquez?",back:"Los eventos sobrenaturales se narran con la misma naturalidad que los cotidianos, sin distinción ni asombro."},
      {id:"fc4",front:"¿Qué destruye a Macondo al final?",back:"Un viento apocalíptico que borra al pueblo: las razas condenadas a cien años de soledad no tienen segunda oportunidad."},
    ],
    debatePrompts:[{id:"cien-d1",question:"¿Los Buendía están condenados por el destino o por sus propias decisiones?",context:"Cada generación repite los mismos errores. ¿Es la soledad una maldición o una elección?"}],
    forumId:"cien-forum"
  },
  {
    id:"mundofeliz", title:"Un mundo feliz", author:"Aldous Huxley", year:1932,
    genre:"Distopía científica", tagline:"La felicidad perfecta tiene un precio.",
    color:"#1E5B7A", spine:"#144160", badgeIcon:"💊", badgeName:"Condicionado",
    questions:[
      {difficulty:"easy",mode:"critical",concept:"El Estado Mundial",text:"¿Cómo garantiza la sociedad del Estado Mundial que todos sean 'felices'?",options:["Mediante la democracia y elecciones libres","Mediante el condicionamiento desde el nacimiento, las drogas (soma) y la eliminación del arte, la ciencia y la religión","Mediante castigos severos a quien sea infeliz","Mediante la riqueza igualitaria para todos los ciudadanos"],correct:1,feedback:"La felicidad del Estado Mundial no es real: es engineered — diseñada químicamente y condicionada desde la infancia.",feedbackAlt:"Huxley muestra que una sociedad perfectamente estable puede ser perfectamente deshumana."},
      {difficulty:"easy",mode:"critical",concept:"El soma",text:"¿Qué función cumple el soma?",options:["Es un antibiótico","Es una droga que elimina el malestar emocional sin efectos secundarios, manteniendo a la gente dócil y satisfecha","Es el alimento principal de las castas inferiores","Es la sustancia que alarga la vida hasta los 200 años"],correct:1,feedback:"El soma es el control perfecto: elimina la angustia existencial antes de que pueda convertirse en cuestionamiento.",feedbackAlt:"'Un gramo a tiempo evita el crimen' — la felicidad química como sustituto de la libertad."},
      {difficulty:"medium",mode:"critical",concept:"Bernard Marx",text:"¿Por qué Bernard Marx no encaja en el sistema?",options:["Es de una casta inferior y nunca fue condicionado","Su condicionamiento fue defectuoso, dejándolo más reflexivo e insatisfecho que el resto de los Alfa","Es el líder secreto de la resistencia","Fue criado por Salvajes fuera del Estado Mundial"],correct:1,feedback:"Bernard es el ejemplo de que incluso el sistema perfecto puede producir anomalías.",feedbackAlt:"Su incomodidad no lo convierte en héroe: es vanidoso y cobarde, lo que lo hace más humano y más trágico."},
      {difficulty:"medium",mode:"fragment",concept:"La felicidad vs. la libertad",text:"¿Qué plantea este diálogo sobre la elección entre estabilidad y libertad?",fragment:"—Pero yo no quiero comodidad. Yo quiero a Dios, quiero poesía, quiero peligro real, quiero libertad, quiero bondad. Quiero pecado. —En efecto —dijo Mustafá Mond—, usted está pidiendo el derecho a ser desgraciado.",options:["Que John está loco","Que John conscientemente elige el sufrimiento y la libertad por encima de la estabilidad perfecta pero vacía","Que Mustafá Mond tiene razón y la felicidad química es superior","Que ambos tienen razón y no hay diferencia"],correct:1,feedback:"John elige ser infeliz antes que sacrificar su humanidad. Es la tesis central del libro.",feedbackAlt:"Huxley muestra que la verdadera humanidad incluye el sufrimiento."},
      {difficulty:"hard",mode:"critical",concept:"Las castas",text:"¿Qué crítica plantea el sistema de castas sobre la desigualdad social?",options:["Que la desigualdad natural es justa y eficiente","Que la desigualdad puede ser aceptada e incluso deseada si se fabrica el consentimiento desde el nacimiento","Que todas las castas son iguales en calidad de vida","Que el sistema de castas es la única forma de organizar una sociedad compleja"],correct:1,feedback:"Las castas no se rebelan porque fueron condicionadas para amar su lugar: es la forma más perfecta de control social.",feedbackAlt:"Huxley adelanta el debate moderno sobre el 'consentimiento fabricado'."},
      {difficulty:"hard",mode:"critical",concept:"Mustafá Mond",text:"¿Qué revela Mustafá Mond sobre el Estado Mundial al confesar que lee libros prohibidos?",options:["Que es un hipócrita que merece ser derrocado","Que incluso los arquitectos del sistema conocen sus limitaciones, pero eligen la estabilidad sobre la verdad","Que existe una resistencia dentro del propio sistema","Que los libros no están realmente prohibidos"],correct:1,feedback:"Mond es el personaje más complejo: comprende todo lo que se ha sacrificado y aun así defiende el sistema por sus beneficios.",feedbackAlt:"Su franqueza con John revela que el sistema no es el producto de la ignorancia sino de una elección calculada."},
      {difficulty:"hard",mode:"highlight",concept:"El derecho al sufrimiento",text:"Subraya la frase que mejor captura la elección central que John hace frente al Estado Mundial:",fragment:"—Pero yo no quiero comodidad. Yo quiero a Dios, quiero poesía, quiero peligro real, quiero libertad, quiero bondad. Quiero pecado. —En efecto —dijo Mustafá Mond—, usted está pidiendo el derecho a ser desgraciado.",correctHighlight:"usted está pidiendo el derecho a ser desgraciado",options:["yo quiero libertad","quiero poesía","usted está pidiendo el derecho a ser desgraciado","quiero peligro real"],correct:2,feedback:"Esa frase resume la paradoja central: la libertad incluye el derecho a sufrir.",feedbackAlt:"Mond lo dice sin condena: simplemente confirma que John eligió la plena humanidad con todos sus costos."},
      {difficulty:"easy",mode:"critical",concept:"Las castas",text:"¿Cuántas castas hay en el Estado Mundial y qué las distingue?",options:["Dos: superiores e inferiores","Cinco: Alfa, Beta, Gamma, Delta y Épsilon — diseñadas genéticamente para funciones distintas y condicionadas para amar su lugar","Tres: la élite, la clase media y los trabajadores","No hay castas, todos son iguales"],correct:1,feedback:"Cada casta nace con capacidades diseñadas para su función y es condicionada para no desear otra cosa.",feedbackAlt:"La utopía del Estado Mundial descansa en hacer que cada uno ame exactamente lo que le toca ser."},
      {difficulty:"easy",mode:"critical",concept:"John el Salvaje",text:"¿De dónde viene John el Salvaje y por qué es importante?",options:["De una ciudad del Estado Mundial que fue destruida","Es hijo de un ciudadano del Estado Mundial criado fuera de él, en una 'reserva' sin condicionamiento — es el único personaje que experimentó ambas realidades","Es un mutante creado en laboratorio","Es un visitante de otro planeta"],correct:1,feedback:"John es el puente entre mundos: ha leído a Shakespeare, conoce el amor y el dolor sin filtros farmacéuticos.",feedbackAlt:"Su perspectiva externa es lo que permite cuestionar desde dentro una sociedad que no puede cuestionarse a sí misma."},
      {difficulty:"easy",mode:"critical",concept:"La familia en el Estado Mundial",text:"¿Por qué la familia está prohibida en el Estado Mundial?",options:["Porque ocupa demasiado espacio en las ciudades","Porque los vínculos familiares crean loyaltades que compiten con la lealtad al Estado y la estabilidad social","Porque la ciencia demostró que es dañina para los niños","Por razones económicas de eficiencia"],correct:1,feedback:"Sin familia, sin historia personal, sin amor exclusivo — el ciudadano pertenece completamente al Estado.",feedbackAlt:"Los términos 'padre' y 'madre' son insultos en el Estado Mundial: la dependencia emocional es inestabilidad."},
      {difficulty:"medium",mode:"critical",concept:"La ingeniería humana",text:"¿Cómo se producen los bebés en el Estado Mundial y qué critica este método?",options:["De forma natural, solo con control de natalidad estricto","En fábricas (Centros de Incubación), con tratamientos químicos que determinan la inteligencia de cada casta desde el inicio — eliminando el azar y la individualidad","Con clonación genética de solo cinco personas","Con reproductor artificial pero sin ingeniería de castas"],correct:1,feedback:"Nacer en una fábrica de castas elimina el origen humano de la identidad: nadie elige quién es.",feedbackAlt:"Huxley critica la reducción del ser humano a producto manufacturado para una función específica."},
      {difficulty:"medium",mode:"critical",concept:"Helmholtz Watson",text:"¿Por qué Helmholtz Watson es exiliado?",options:["Por relacionarse con John el Salvaje","Porque, a pesar de ser Alfa exitoso, siente que su talento de escritor está siendo desperdiciado en propaganda y comienza a escribir sobre cosas que generan pensamiento real","Por consumir soma en exceso","Por no cumplir su cuota de trabajo"],correct:1,feedback:"Helmholtz tiene el talento de nombrar cosas verdaderas — eso lo hace incompatible con el sistema.",feedbackAlt:"Es el artista que no puede usar su arte para mentir, y ese es su crimen en el Estado Mundial."},
      {difficulty:"medium",mode:"critical",concept:"El papel del arte",text:"¿Por qué están prohibidos Shakespeare y el arte verdadero en el Estado Mundial?",options:["Porque son demasiado aburridos para la gente moderna","Porque el arte auténtico genera emociones fuertes e ideas peligrosas que amenazan la estabilidad social","Porque los ciudadanos prefieren el entretenimiento moderno","Porque el Estado no tiene presupuesto para el arte"],correct:1,feedback:"El arte verdadero lleva al sufrimiento, la nostalgia, el deseo — todo lo que el soma debe eliminar.",feedbackAlt:"Mond confiesa que él también conserva libros prohibidos: el arte tiene poder incluso para los que lo censuran."},
      {difficulty:"hard",mode:"critical",concept:"Huxley vs. Orwell",text:"¿Cuál es la diferencia entre la distopía de Huxley y la de Orwell?",options:["No hay diferencia significativa entre las dos","Orwell muestra un mundo que oprime con dolor y terror; Huxley muestra que la opresión puede hacerse con placer: la gente puede amar su propia jaula","Orwell fue más optimista que Huxley","Huxley ambientó su historia en el pasado"],correct:1,feedback:"La advertencia de Huxley es más sutil y, para algunos, más aterradora: cuando el control viene disfrazado de felicidad, nadie quiere resistir.",feedbackAlt:"Neil Postman dijo: 'Orwell temía que nos quitaran los libros. Huxley temía que nadie quisiera leerlos.'"},
      {difficulty:"hard",mode:"critical",concept:"El final de John",text:"¿Por qué se suicida John el Salvaje al final?",options:["Porque no puede encontrar soma suficiente","Porque no puede vivir en ninguno de los dos mundos: el Estado Mundial lo convierte en atracción de turistas y su intento de vida pura fracasa ante la curiosidad ajena","Porque Lenina lo rechaza","Porque el Estado lo condena a muerte"],correct:1,feedback:"John busca la pureza y el sufrimiento genuino pero el Estado Mundial lo convierte en un espectáculo — su suicidio es la única escape del circo.",feedbackAlt:"Su muerte confirma la tesis: en el Estado Mundial, incluso la rebeldía se convierte en entretenimiento."},
      {difficulty:"medium",mode:"critical",concept:"El arte prohibido",text:"¿Por qué se consideran peligrosos los libros y el arte verdadero en el Estado Mundial?",options:["Porque son difíciles de entender para los ciudadanos comunes","Porque generan emociones fuertes, preguntas sin respuesta y deseos de lo que no existe — todo lo que desestabiliza la comodidad de la estabilidad","Porque son viejos y obsoletos","Porque cuestan demasiado producirlos"],correct:1,feedback:"El arte que conmueve te hace desear algo más. El Estado Mundial prefiere que nadie desee más de lo que tiene.",feedbackAlt:"Mond conserva libros prohibidos en secreto — incluso él reconoce que hay algo en ellos que el soma no puede reemplazar."},
      {difficulty:"medium",mode:"critical",concept:"La cría en botella",text:"¿Qué implica criar humanos en frascos y separar el sexo de la reproducción?",options:["Avance científico positivo","La eliminación del amor materno, la familia y la identidad individual: nadie tiene padres, nadie fue amado antes de nacer — la identidad es una función asignada, no una historia vivida","Una solución práctica a la sobrepoblación","Un experimento estético de Huxley"],correct:1,feedback:"Sin origen, sin historia personal, sin vínculo — el ciudadano del Estado Mundial es un producto sin pasado.",feedbackAlt:"Huxley anticipa los debates actuales sobre la biotecnología y la ingeniería genética."},
      {difficulty:"hard",mode:"critical",concept:"El exilio como destino noble",text:"¿Por qué Bernard y Helmholtz son enviados a islas en lugar de ejecutados?",options:["Por misericordia del Estado","Porque el Estado reconoce que las mentes disidentes son raras y valiosas — las concentra donde no puedan contaminar a otros pero donde puedan desarrollarse sin suprimir el potencial creativo","Para castigarlos con el aislamiento","Porque las islas son prisiones más eficientes"],correct:1,feedback:"Las islas son un destino para quienes piensan diferente — es la forma más sutil de control: en lugar de eliminar a los diferentes, los aisla.",feedbackAlt:"Helmholtz acepta el exilio con alegría: prefiere una isla donde pueda pensar a una sociedad donde no puede."},
      {difficulty:"hard",mode:"critical",concept:"El soma como metáfora",text:"¿Qué representan las drogas legales y obligatorias del Estado Mundial en nuestro mundo contemporáneo?",options:["Solo son ficción sin correlato real","Son la metáfora de todas las formas en que las sociedades modernas usan el entretenimiento, el consumo y la farmacología para mantener a las personas satisfechas y sin cuestionamiento","Solo representan el abuso de drogas recreativas","Son una crítica al sistema de salud"],correct:1,feedback:"El soma es cualquier cosa que funcione: redes sociales, entretenimiento perpetuo, consumismo, medicación del malestar.",feedbackAlt:"Huxley escribió en 1932 pero su diagnóstico sigue vigente: la anestesia del cuestionamiento toma muchas formas."},
    ],
    flashcards:[
      {id:"fc1",front:"¿Qué es el soma?",back:"Una droga perfecta que elimina el malestar emocional sin efectos secundarios, manteniendo a la gente dócil y satisfecha."},
      {id:"fc2",front:"¿Cuáles son las cinco castas del Estado Mundial?",back:"Alfa, Beta, Gamma, Delta y Épsilon. Cada una es condicionada para amar su lugar en la jerarquía social."},
      {id:"fc3",front:"¿Qué elige John el Salvaje al final?",back:"Elige el sufrimiento, la libertad y la imperfección por encima de la estabilidad perfecta pero vacía."},
      {id:"fc4",front:"¿Qué critica Huxley con el Estado Mundial?",back:"Que una sociedad perfectamente estable puede ser perfectamente deshumana si sacrifica el arte, la religión y la libertad."},
    ],
    debatePrompts:[{id:"mundofeliz-d1",question:"¿Preferirías vivir en el Estado Mundial o en el mundo actual?",context:"El Estado Mundial garantiza felicidad, salud y estabilidad a cambio de libertad, arte y sufrimiento genuino. ¿Vale la pena el intercambio?"}],
    forumId:"mundofeliz-forum"
  },
  {
    id:"narnia", title:"El León, la Bruja y el Armario", author:"C.S. Lewis", year:1950,
    genre:"Fantasía / Alegoría", tagline:"Siempre ha habido un invierno aquí, pero nunca Navidad.",
    color:"#5E3B7A", spine:"#3E2558", badgeIcon:"🦁", badgeName:"Narniano",
    questions:[
      {difficulty:"easy",mode:"critical",concept:"La entrada a Narnia",text:"¿Cómo descubren los niños Pevensie la entrada al reino de Narnia?",options:["A través de un sueño compartido","Lucy la encuentra al entrar en un armario antiguo durante un juego de escondite","Les es revelada por el Profesor Kirke","Aslan los llama directamente desde otro mundo"],correct:1,feedback:"Lucy descubre Narnia sola al explorar el armario, siendo la primera en cruzar.",feedbackAlt:"El armario es un umbral entre mundos: lo mundano como puerta a lo extraordinario."},
      {difficulty:"easy",mode:"critical",concept:"La Bruja Blanca",text:"¿Qué poder tiene la Bruja Blanca sobre Narnia?",options:["Controla las mentes de todos los animales","Ha hechizado Narnia para que sea siempre invierno pero nunca Navidad","Puede destruir Narnia con una sola palabra","Es inmortal y no puede ser derrotada"],correct:1,feedback:"El invierno sin Navidad es la metáfora de una tiranía que quita la alegría y la esperanza.",feedbackAlt:"C.S. Lewis usó el 'invierno eterno sin Navidad' como imagen de la opresión espiritual."},
      {difficulty:"easy",mode:"critical",concept:"Edmund y la Bruja",text:"¿Por qué Edmund traiciona a sus hermanos y se une a la Bruja Blanca?",options:["Porque la Bruja lo amenazó con matarlos","Porque la Bruja lo sedujo con Turkish Delight encantado y la promesa de hacerlo rey","Porque odiaba a sus hermanos desde siempre","Porque creía que la Bruja era buena"],correct:1,feedback:"El Turkish Delight encantado es adictivo: Edmund quiere más aunque sabe que está mal, símbolo de la tentación y el egoísmo.",feedbackAlt:"La traición de Edmund ilustra cómo los deseos egoístas pueden cegarnos."},
      {difficulty:"medium",mode:"critical",concept:"Aslan",text:"¿Qué representa Aslan en la alegoría cristiana de C.S. Lewis?",options:["Es simplemente un rey-animal sin connotaciones religiosas","Representa a Cristo: muere sacrificialmente para salvar a Edmund y resucita, venciendo la Magia Profunda","Es el símbolo del poder político legítimo","Representa la naturaleza salvaje e indomable del bien"],correct:1,feedback:"Aslan es la figura crística: el sacrificio voluntario por el culpable, la muerte aparente y la resurrección.",feedbackAlt:"Lewis construyó deliberadamente a Aslan como 'cómo sería Cristo si viniera a un mundo de bestias parlantes'."},
      {difficulty:"medium",mode:"fragment",concept:"La Magia Profunda",text:"¿Qué revela este pasaje sobre el conflicto central entre la ley y el sacrificio?",fragment:"—¿Conoces la Magia que existe desde el alba del tiempo? Ella dijo que todo traidor pertenecía a ella. Pero hay una Magia más profunda aún, anterior al alba del tiempo.",options:["Que la Bruja tiene razón y la ley siempre debe cumplirse","Que existe una ley más antigua: el amor sacrificial puede vencer a la muerte misma","Que Aslan está buscando un truco legal","Que la magia no tiene reglas"],correct:1,feedback:"La 'Magia Más Profunda' es la ley del amor sacrificial que precede y supera a la ley de la muerte.",feedbackAlt:"Lewis presenta el sacrificio de Aslan como la revelación de una verdad más antigua que cualquier ley."},
      {difficulty:"hard",mode:"critical",concept:"La alegoría cristiana",text:"¿Por qué Lewis eligió el formato de cuento de hadas para transmitir ideas teológicas?",options:["Porque era más fácil de escribir que un tratado filosófico","Porque la narrativa y la imaginación pueden transmitir verdades espirituales sin las defensas que levantamos ante el discurso religioso directo","Porque fue un encargo editorial que limitó el formato","Porque creía que los niños no necesitan explicaciones complejas"],correct:1,feedback:"Lewis creía que la narrativa y la imaginación pueden llegar donde el argumento racional falla.",feedbackAlt:"En su autobiografía, Lewis explicó que primero 'vio' a Aslan y luego entendió qué significaba."},
      {difficulty:"hard",mode:"highlight",concept:"El invierno eterno",text:"Subraya la frase que mejor captura la naturaleza de la tiranía de la Bruja Blanca:",fragment:"Siempre invierno, nunca Navidad —pensó Lucy—. ¿Qué horrible debía ser eso! ¿No vendrá nunca la primavera? Nadie recordaba el sol ni los colores de las flores. Narnia entera estaba sepultada bajo una nieve que no pertenecía a ninguna estación.",correctHighlight:"Siempre invierno, nunca Navidad",options:["Narnia entera estaba sepultada","no vendrá nunca la primavera","Siempre invierno, nunca Navidad","una nieve que no pertenecía a ninguna estación"],correct:2,feedback:"'Siempre invierno, nunca Navidad' captura la crueldad específica de la Bruja.",feedbackAlt:"Esta imagen se convirtió en una de las más memorables de la literatura fantástica."},
      {difficulty:"easy",mode:"critical",concept:"Los cuatro Pevensie",text:"¿Quiénes son los cuatro hermanos Pevensie?",options:["Hermanos huérfanos que buscan hogar en Narnia","Peter, Susan, Edmund y Lucy — niños ingleses evacuados durante la Segunda Guerra Mundial que descubren Narnia","Cuatro príncipes de una tierra mágica","Los hijos del Profesor Kirke"],correct:1,feedback:"Los Pevensie son niños comunes que enfrentan algo extraordinario — C.S. Lewis conecta así lo mundano con lo sobrenatural.",feedbackAlt:"Su carácter humano hace creíble su viaje y accesible la alegoría."},
      {difficulty:"easy",mode:"critical",concept:"El Profesor Kirke",text:"¿Cuál es la postura del Profesor Kirke cuando Lucy le cuenta sobre Narnia?",options:["No le cree porque los adultos siempre dudan","Le cree: usa la lógica para demostrar a los hermanos que si Lucy no es mentirosa ni loca, entonces dice la verdad","La envía al psicólogo","La regaña por contar mentiras"],correct:1,feedback:"El Profesor Kirke es el único adulto que aplica la lógica correctamente: rechazar lo imposible sin evidencia es lo irracional.",feedbackAlt:"Lewis usa al Profesor para criticar la mentalidad que descarta lo sobrenatural por costumbre, no por razón."},
      {difficulty:"medium",mode:"critical",concept:"El sacrificio de Aslan",text:"¿Por qué Aslan no le explica a los niños que resucitará después de su muerte?",options:["Porque no sabe si resucitará","Porque la Magia Más Profunda debe ser descubierta, no explicada — el conocimiento sin experiencia no transforma","Porque quiere que los niños sufran su pérdida genuinamente","Porque tiene prohibido hacerlo"],correct:1,feedback:"Lewis construye una experiencia, no una lección. Lucy y Susan deben vivir el dolor y la alegría de la resurrección para entenderla.",feedbackAlt:"Es la diferencia entre la fe como conocimiento y la fe como experiencia."},
      {difficulty:"medium",mode:"critical",concept:"La redención de Edmund",text:"¿Por qué es importante que sea Edmund específicamente quien Aslan salva?",options:["Porque Edmund era el más joven y necesitaba más protección","Porque Edmund fue el traidor: salvar al que traicionó es el acto de gracia más poderoso que podría demostrarse","Porque Aslan lo eligió al azar","Porque Peter lo pidió"],correct:1,feedback:"La gracia es más poderosa cuando se otorga a quien menos la merece. Edmund traicionó y fue perdonado completamente.",feedbackAlt:"Este es el núcleo teológico: la redención no se gana, se recibe."},
      {difficulty:"medium",mode:"critical",concept:"El armario como umbral",text:"¿Qué representa el armario como puerta entre mundos?",options:["Un objeto con magia aleatoria","El umbral entre lo ordinario y lo sagrado: lo mundano puede ser la puerta a lo extraordinario si se entra con el corazón abierto","Un objeto tecnológico avanzado","El sueño de los niños"],correct:1,feedback:"Lewis enseña que el mundo espiritual no está separado radicalmente del cotidiano — puede estar detrás de un armario.",feedbackAlt:"Esta es una de las afirmaciones más hermosas del libro: lo sagrado puede vivir dentro de lo ordinario."},
      {difficulty:"medium",mode:"fragment",concept:"El valor de Peter",text:"¿Qué revela este momento sobre el crecimiento de Peter como líder?",fragment:"Peter miró a la bestia que se acercaba y sintió pánico. Luego miró a sus hermanos detrás de él. Pensó: si retrocedo, ellos mueren. Y levantó la espada aunque le temblaban las manos.",options:["Que el valor es la ausencia del miedo","Que el valor real es actuar pese al miedo, cuando algo más importante que el propio temor está en juego","Que Peter nunca tuvo miedo","Que los héroes no sienten pánico"],correct:1,feedback:"Lewis define el valor como actuar a pesar del miedo, no sin él. Peter es valiente precisamente porque tiene miedo y actúa igual.",feedbackAlt:"Es la definición más honesta del coraje que la novela propone."},
      {difficulty:"hard",mode:"critical",concept:"Narnia y la imaginación moral",text:"¿Qué diferencia hay entre la alegoría de Lewis y la propaganda religiosa?",options:["No hay diferencia, Narnia es propaganda directa","Lewis crea una historia que puede leerse plenamente como fantasía o como alegoría — la historia tiene vida propia y no requiere la clave religiosa para funcionar","Lewis negó que Narnia fuera alegórica","Narnia tiene menos simbolismo que la Biblia"],correct:1,feedback:"La mejor alegoría funciona en dos niveles: como historia pura y como símbolo. Narnia hace exactamente eso.",feedbackAlt:"Un lector que no conoce el cristanismo puede disfrutar Narnia completamente y un lector creyente puede encontrar algo más."},
      {difficulty:"hard",mode:"critical",concept:"El tiempo en Narnia",text:"¿Qué implica que el tiempo en Narnia fluya diferente al tiempo en el mundo real?",options:["Es solo un recurso de conveniencia narrativa","Sugiere que los mundos espirituales o imaginarios tienen su propio tiempo, separado de la historia humana","Es un error de continuidad","Indica que los niños no envejecen"],correct:1,feedback:"Lewis usa la diferencia temporal para sugerir que hay realidades que no están sujetas a las mismas limitaciones que el mundo ordinario.",feedbackAlt:"El tiempo diferente en Narnia es también la razón por la que es posible vivir décadas allí y volver siendo niños."},
      {difficulty:"medium",mode:"critical",concept:"El Fauno y Tumnus",text:"¿Qué representa la transformación de Tumnus, el fauno, de sirviente de la Bruja a aliado de Lucy?",options:["Un giro de trama sin importancia simbólica","La idea de que incluso los que colaboran con el mal pueden redimirse cuando se enfrentan directamente a una persona concreta que merecen cuidar","El fauno siempre fue bueno y fingía ante la Bruja","Es un personaje sin relevancia alegórica"],correct:1,feedback:"Tumnus tiene órdenes de entregar a los Hijos de Adán pero no puede hacerlo cuando Lucy está frente a él — la humanidad concreta vence a la obediencia abstracta.",feedbackAlt:"Lewis muestra que la redención comienza en el contacto real con otra persona, no en las ideas abstractas."},
      {difficulty:"hard",mode:"critical",concept:"La muerte de Aslan y la Magia Profunda",text:"¿Por qué Aslan muere en lugar de simplemente combatir a la Bruja con su poder?",options:["Porque la Bruja es más fuerte que él","Porque la Magia Profunda (la ley del universo) exige que el traidor muera — y alguien inocente puede morir voluntariamente en su lugar, activando la Magia Más Profunda","Por accidente narrativo","Para dar una lección a los cuatro niños"],correct:1,feedback:"El sacrificio voluntario de lo inocente activa una ley más antigua que la muerte misma: es la estructura central de la teología cristiana transpuesta a Narnia.",feedbackAlt:"Lewis no esconde la analogía — la construyó deliberadamente para transmitir la experiencia de la gracia."},
      {difficulty:"hard",mode:"critical",concept:"Peter, High King",text:"¿Qué significa que Peter se convierta en rey al final y luego deba volver a ser niño?",options:["Es un error de la trama","La madurez y la responsabilidad no son propiedades permanentes del individuo sino roles que se asumen cuando la situación los requiere — y pueden abandonarse cuando el llamado termina","Es una metáfora del crecimiento infantil normal","Lewis no pensó las implicaciones de ese giro"],correct:1,feedback:"Los niños que gobiernan Narnia como adultos regresan siendo niños — porque sus verdaderos cuerpos son los de niños. Narnia les enseñó pero no los convirtió en adultos prematuramente.",feedbackAlt:"Lewis preserva la infancia como un estado valioso en sí mismo, no solo como preparación para la adultez."},
      {difficulty:"hard",mode:"highlight",concept:"El coraje moral",text:"Subraya la frase que mejor define el valor real según C.S. Lewis en la novela:",fragment:"Aslan no es un aslan manso. No es que sea seguro. Pero es bueno. —Entonces —dijo Lucy— supongo que no importa tanto si tengo miedo, mientras él esté presente.",correctHighlight:"No es que sea seguro. Pero es bueno",options:["Aslan no es un aslan manso","supongo que no importa tanto si tengo miedo","No es que sea seguro. Pero es bueno","mientras él esté presente"],correct:2,feedback:"Esta frase captura la teología de Lewis: el bien no es confort ni seguridad — es bondad que puede ser temible.",feedbackAlt:"El bien y lo inofensivo no son lo mismo. Lewis insiste en que lo sagrado es poderoso y puede asustar."},
    ],
    flashcards:[
      {id:"fc1",front:"¿Qué representa Aslan?",back:"La figura de Cristo: muere sacrificialmente para salvar a Edmund y resucita, venciendo la Magia Profunda de la muerte."},
      {id:"fc2",front:"¿Qué hechizo tiene la Bruja Blanca sobre Narnia?",back:"Ha hechizado Narnia para que sea siempre invierno pero nunca Navidad: la tiranía que elimina la alegría."},
      {id:"fc3",front:"¿Por qué Edmund traiciona a sus hermanos?",back:"Fue seducido por el Turkish Delight encantado de la Bruja y la promesa de ser rey: símbolo de la tentación egoísta."},
      {id:"fc4",front:"¿Qué es la 'Magia Más Profunda'?",back:"La ley más antigua que precede a la muerte: el amor sacrificial que puede vencer a la muerte misma."},
    ],
    debatePrompts:[{id:"narnia-d1",question:"¿Debe leerse Narnia como alegoría cristiana o como fantasía pura?",context:"C.S. Lewis dijo que Aslan era deliberadamente cristológico. ¿Enriquece o limita la historia saber eso al leer?"}],
    forumId:"narnia-forum"
  },
  {
    id:"frankenstein", title:"Frankenstein", author:"Mary Shelley", year:1818,
    genre:"Novela gótica / Ciencia ficción", tagline:"¿Quién es realmente el monstruo?",
    color:"#2E5C3A", spine:"#1C3D26", badgeIcon:"⚡", badgeName:"Creador",
    questions:[
      {difficulty:"easy",mode:"critical",concept:"El creador",text:"¿Quién es Victor Frankenstein?",options:["El monstruo creado en el laboratorio","Un científico obsesionado con descubrir el secreto de la vida que crea un ser con partes de cadáveres","Un médico que estudia la muerte en Ginebra","El narrador principal de la novela"],correct:1,feedback:"Victor es el verdadero protagonista: su ambición desmedida pone en marcha toda la tragedia.",feedbackAlt:"Es importante no confundir a Victor con su creación."},
      {difficulty:"easy",mode:"critical",concept:"La criatura",text:"¿Cómo reacciona Victor Frankenstein al ver a su criatura viva?",options:["La abraza con orgullo paternal","La estudia científicamente","Huye aterrorizado, abandonándola sin nombre ni cuidado","La destruye inmediatamente"],correct:2,feedback:"El abandono de Victor es el verdadero origen del conflicto: la criatura nace sin padre, sin nombre, sin lugar en el mundo.",feedbackAlt:"Victor crea vida y huye de su responsabilidad — ese abandono desencadena todo."},
      {difficulty:"easy",mode:"fragment",concept:"La humanidad de la criatura",text:"¿Qué revela este pasaje sobre la naturaleza de la criatura?",fragment:"Yo también podía describir emociones de placer y dolor. Sentía el frío y la calidez. Comía frutos del bosque. Pero lo más extraño: anhelaba compañía y afecto. Era, en esto, completamente humano.",options:["Que la criatura es puramente un animal instintivo","Que la criatura tiene emociones, necesidades y deseos humanos pero está condenada al rechazo","Que la criatura es superior a los humanos","Que la criatura no sufre realmente"],correct:1,feedback:"La criatura no es un monstruo nato: tiene capacidad de amor y deseo de conexión. La sociedad la convierte en lo que temen.",feedbackAlt:"Mary Shelley construyó a la criatura como un ser profundamente humano para desafiar al lector."},
      {difficulty:"medium",mode:"critical",concept:"Responsabilidad del creador",text:"¿Qué crítica filosófica plantea la novela sobre la ciencia?",options:["Que la ciencia siempre es peligrosa y debe detenerse","Que el avance científico sin responsabilidad ética puede crear daños irreparables","Que Victor era un mal científico técnicamente","Que la ciencia del siglo XIX era demasiado primitiva"],correct:1,feedback:"Shelley no condena la ciencia sino la irresponsabilidad: crear sin aceptar las consecuencias.",feedbackAlt:"La novela es una advertencia sobre el poder sin ética, no sobre el conocimiento en sí."},
      {difficulty:"medium",mode:"critical",concept:"La criatura vs. Victor",text:"¿Cuál de los dos personajes tiene mayor justificación moral para sus acciones?",options:["Victor, porque la criatura mató personas inocentes","La criatura, porque fue abandonada y rechazada sin haber elegido existir","Ambos tienen igual responsabilidad moral","Ninguno tiene justificación válida"],correct:1,feedback:"La criatura asesinó, pero nunca eligió existir ni ser abandonada. Victor creó la situación y huyó de ella.",feedbackAlt:"Shelley deliberadamente hace difícil juzgar a la criatura sin considerar el contexto de su creación."},
      {difficulty:"hard",mode:"critical",concept:"¿Quién es el monstruo?",text:"¿Por qué el título 'Frankenstein' ambiguamente puede referirse tanto al creador como a la criatura?",options:["Porque Shelley cometió un error al titular la novela","Porque ambos son monstruos en sentido moral: uno por abandono irresponsable, el otro por venganza destructiva","Porque la criatura adoptó el apellido Frankenstein","Porque Victor y la criatura son la misma persona en sentido alegórico"],correct:1,feedback:"Esta ambigüedad es intencional: Shelley pregunta si el verdadero monstruo es quien tiene aspecto aterrador o quien actúa sin responsabilidad ni amor.",feedbackAlt:"El título sin nombre propio de la criatura es la pregunta central de la novela."},
      {difficulty:"hard",mode:"highlight",concept:"El origen del mal",text:"Subraya la frase que mejor expresa por qué la criatura se convierte en lo que es:",fragment:"Fui benévolo y bueno; la miseria me hizo demonio. Hazme feliz y seré virtuoso de nuevo. Tú eres mi creador, pero yo soy tu amo — ¡obedéceme!",correctHighlight:"la miseria me hizo demonio",options:["Fui benévolo y bueno","la miseria me hizo demonio","yo soy tu amo","Tú eres mi creador"],correct:1,feedback:"La criatura no nació malvada. Fue el rechazo y el sufrimiento lo que la transformó — esa es la tesis de Shelley.",feedbackAlt:"'La miseria me hizo demonio' es una de las frases más importantes de la novela gótica."},
      {difficulty:"hard",mode:"critical",concept:"Romanticismo",text:"¿Cómo se relaciona Frankenstein con el movimiento romántico?",options:["No tiene relación con el Romanticismo","Es una crítica al racionalismo ilustrado: la naturaleza y las emociones se rebelan contra el control científico","Es una celebración de los avances industriales de la época","Es principalmente una novela de terror sin contenido filosófico"],correct:1,feedback:"El Romanticismo reaccionó contra la Ilustración. Frankenstein muestra que el control racional de la naturaleza tiene consecuencias incontrolables.",feedbackAlt:"Mary Shelley escribe en el corazón del movimiento romántico inglés, junto a Byron y Percy Shelley."},
      {difficulty:"easy",mode:"critical",concept:"La creación",text:"¿Qué usa Victor Frankenstein para crear la vida?",options:["Magia negra y rituales","Electricidad y partes de cadáveres humanos ensambladas — la ciencia sin límites éticos","Solo química avanzada","Fluidos de animales vivos"],correct:1,feedback:"La electricidad como fuente de vida conecta la novela con el galvanismo, teoría científica real de la época de Shelley.",feedbackAlt:"Mary Shelley tomó inspiración de experimentos reales de su época y los llevó a su extremo lógico."},
      {difficulty:"easy",mode:"critical",concept:"El contexto de escritura",text:"¿Cómo surgió la idea de Frankenstein?",options:["De una pesadilla de Victor Hugo","Durante una apuesta de historias de terror entre Mary Shelley, Percy Shelley y Lord Byron en Villa Diodati","De la lectura de textos médicos","De un encargo editorial"],correct:1,feedback:"Mary Shelley tenía 18 años cuando escribió Frankenstein durante un verano lluvioso en Suiza, en una competencia literaria famosa.",feedbackAlt:"La novela nació de una reunión de mentes brillantes: Byron, Percy Shelley, Polidori y la joven Mary."},
      {difficulty:"medium",mode:"critical",concept:"El rechazo de la sociedad",text:"¿Por qué la criatura aprende a odiar a la humanidad?",options:["Porque nacío con odio incorporado","Porque fue rechazada universalmente solo por su apariencia, sin que nadie le diera la oportunidad de mostrar su humanidad interior","Porque mató accidentalmente a alguien al principio","Porque Victor le programó emociones negativas"],correct:1,feedback:"La criatura aprende a hablar, lee a los clásicos y observa a una familia con amor — y cuando intenta acercarse, es atacada.",feedbackAlt:"La crueldad no es de la criatura sino de quienes la juzgan por su aspecto antes de conocerla."},
      {difficulty:"medium",mode:"critical",concept:"La petición a Victor",text:"¿Qué le pide la criatura a Victor y por qué Victor la niega?",options:["Le pide dinero para vivir","Le pide que cree una compañera femenina para que no esté solo — Victor empieza pero la destruye por miedo a las consecuencias","Le pide que lo destruya para terminar su sufrimiento","Le pide que lo presente a la sociedad"],correct:1,feedback:"Victor destruye a la compañera por miedo a que se reproduzcan y amenacen a la humanidad — pero su decisión destruye el último lazo.",feedbackAlt:"La destrucción de la compañera es el punto de no retorno: la criatura declara guerra."},
      {difficulty:"medium",mode:"critical",concept:"La narración enmarcada",text:"¿Qué técnica narrativa usa Shelley y qué efecto crea?",options:["Narración lineal en primera persona de Victor","Tres narraciones enmarcadas: Walton narra a su hermana, dentro Victor narra a Walton, dentro la criatura narra a Victor — cada voz filtra la historia","Narración omnisciente sin involucración del autor","Solo la voz de la criatura desde el principio"],correct:1,feedback:"Las narraciones anidadas crean distancia y permiten al lector escuchar versiones diferentes del mismo horror.",feedbackAlt:"La estructura de cajas chinas hace que ninguna voz sea completamente confiable — Shelley nos obliga a juzgar por nosotros mismos."},
      {difficulty:"medium",mode:"fragment",concept:"La empatía por la criatura",text:"¿Qué logra Shelley con este fragmento narrado por la criatura?",fragment:"Nadie me amó desde el principio. ¿Cómo pudo alguien esperar amor de mí? No elegí existir. No elegí este cuerpo. Elegirían que no hubiera nacido antes que verme sufrir y ser feliz.",options:["Que el lector sienta miedo de la criatura","Que el lector desarrolle empatía: la criatura argumenta con razón — su monstruosidad es respuesta al trato que recibió, no su naturaleza","Que el lector juzgue a Victor como inocente","Que la criatura se presente como víctima sin agencia"],correct:1,feedback:"Shelley da a la criatura la capacidad de articular su injusticia con elocuencia — es imposible no entender su perspectiva.",feedbackAlt:"Una criatura que habla así no puede ser solo un monstruo: tiene conciencia, dolor y lógica."},
      {difficulty:"hard",mode:"critical",concept:"La ciencia y la ética",text:"¿Qué pregunta ética central plantea Frankenstein sobre el avance científico?",options:["¿Puede la ciencia crear vida?","¿Tiene el científico responsabilidad por las consecuencias de sus creaciones aunque no las haya previsto?","¿Es la ciencia más poderosa que la naturaleza?","¿Debe el gobierno controlar los experimentos científicos?"],correct:1,feedback:"Victor no planeó el desastre, pero lo creó. La novela establece: la ignorancia de las consecuencias no exime de la responsabilidad.",feedbackAlt:"Esta pregunta es más urgente hoy que en 1818: tecnología genética, IA, armas biológicas — los dilemas de Victor son nuestros."},
      {difficulty:"hard",mode:"critical",concept:"El Prometeo moderno",text:"¿Por qué el subtítulo de la novela es 'El Prometeo moderno'?",options:["Porque Frankenstein roba el fuego de los dioses como Prometeo robó el fuego para los humanos, pagando el precio por traspasar los límites naturales","Porque Victor viaja al Cáucaso como Prometeo","Porque la criatura es encadenada como Prometeo","Porque Prometeo era famoso en la época de Shelley"],correct:0,feedback:"Prometeo robó el fuego divino para los humanos — Victor roba el secreto de la vida para la ciencia. Ambos pagan un precio terrible.",feedbackAlt:"El mito de Prometeo es la advertencia griega original sobre los límites que los humanos no deberían cruzar."},
      {difficulty:"medium",mode:"critical",concept:"La lectura de la criatura",text:"¿Qué lee la criatura en su escondite y cómo la transforma?",options:["Lee libros de ciencia que le dan poder","Lee El paraíso perdido, Las vidas paralelas de Plutarco y Werther — literatura que le da vocabulario para entender y articular su propia tragedia","Lee las notas del diario de Victor","Solo observa a la familia de los De Lacey"],correct:1,feedback:"La criatura se educa a sí misma con los grandes textos de la humanidad — y eso hace su condena más elocuente y más dura.",feedbackAlt:"Una criatura sin educación no podría articular su dolor. Victor la abandonó sin darle herramientas; las consiguió sola."},
      {difficulty:"hard",mode:"critical",concept:"El arco de Victor",text:"¿Cómo cambia Victor Frankenstein a lo largo de la novela?",options:["No cambia en absoluto","Pasa de la ambición desmedida a la persecución obsesiva de la criatura, pero nunca acepta completamente su responsabilidad — incluso al final sigue culpando a la criatura más que a sí mismo","Se convierte en un hombre completamente arrepentido y humilde","Se convierte en el villano total sin complejidad"],correct:1,feedback:"Victor nunca tiene la lucidez moral plena que su historia requeriría. Es la tragedia de alguien incapaz de aprender.",feedbackAlt:"Shelley construye a Victor como incapaz de la autoevaluación honesta que podría haberlo salvado."},
      {difficulty:"hard",mode:"critical",concept:"La naturaleza de los monstruos",text:"¿Qué dice la novela sobre quién define qué es un monstruo?",options:["Los monstruos son los que más daño hacen objetivamente","La definición de monstruo depende de quién tiene el poder de nombrar: la criatura es llamada monstruo por quienes tienen miedo de su apariencia, pero sus actos tienen causas que nadie quiere ver","Los monstruos son seres sobrenaturales distintos de los humanos","Victor es claramente el monstruo y la criatura no lo es"],correct:1,feedback:"Shelley hace al lector incómodo: la criatura que llamas monstruo tiene razones, y el humano que parece normal cometió el crimen original.",feedbackAlt:"El monstruo es una construcción social: lo que no encaja en la norma y asusta al grupo."},
      {difficulty:"hard",mode:"highlight",concept:"El fin de la persecución",text:"Subraya la frase que mejor captura la tragedia del vínculo entre Victor y su criatura:",fragment:"Estaré contigo en tu noche de bodas. Victor no comprendió la amenaza hasta que fue demasiado tarde. Eran dos soledades encadenadas, persiguiéndose hasta el fin del mundo, sin poder separarse ni estar juntas.",correctHighlight:"Eran dos soledades encadenadas, persiguiéndose hasta el fin del mundo",options:["Estaré contigo en tu noche de bodas","sin poder separarse ni estar juntas","Eran dos soledades encadenadas, persiguiéndose hasta el fin del mundo","Victor no comprendió la amenaza"],correct:2,feedback:"El creador y su criatura son una sola tragedia: inseparables, incompatibles, condenados el uno por el otro.",feedbackAlt:"La persecución hasta el Ártico es la imagen definitiva del vínculo: ni vida juntos ni vida separados."},
    ],
    flashcards:[
      {id:"fc1",front:"¿Quién creó a la criatura y por qué la abandona?",back:"Victor Frankenstein la crea por ambición científica y la abandona aterrorizado al ver lo que hizo — ese abandono desencadena toda la tragedia."},
      {id:"fc2",front:"¿Por qué la criatura se vuelve violenta?",back:"Por el rechazo absoluto de todos los humanos. Nació con capacidad de amor pero fue tratada como monstruo desde el primer momento."},
      {id:"fc3",front:"¿Qué crítica filosófica hace Mary Shelley?",back:"Que el avance científico sin responsabilidad ética es destructivo. No condena la ciencia, condena la irresponsabilidad del creador."},
      {id:"fc4",front:"¿Cuál es la ambigüedad central del título?",back:"'Frankenstein' puede referirse al creador irresponsable o a la criatura rechazada — ambos son 'monstruos' en sentido moral distinto."},
    ],
    debatePrompts:[{id:"frank-d1",question:"¿Victor Frankenstein o su criatura: quién es el verdadero monstruo?",context:"Victor creó vida y huyó de ella. La criatura mató gente inocente. ¿El origen del mal justifica sus actos o los contextualizan?"}],
    forumId:"frankenstein-forum"
  },
  {
    id:"tregua", title:"La tregua", author:"Mario Benedetti", year:1960,
    genre:"Novela / Literatura latinoamericana", tagline:"Un amor que no debería existir, pero existe.",
    color:"#7A3A2A", spine:"#5C2A1C", badgeIcon:"📓", badgeName:"Diarista",
    questions:[
      {difficulty:"easy",mode:"critical",concept:"El diario",text:"¿Qué forma narrativa usa Benedetti en La tregua?",options:["Una narración en tercera persona omnisciente","Un diario íntimo escrito por Martín Santomé que registra su vida cotidiana y sus emociones","Un monólogo dramático al estilo teatral","Cartas entre los protagonistas"],correct:1,feedback:"El diario es fundamental: nos da acceso directo a los pensamientos más íntimos de Santomé sin filtros.",feedbackAlt:"Benedetti elige el diario porque su protagonista es un hombre que raramente expresa sus emociones en voz alta."},
      {difficulty:"easy",mode:"critical",concept:"Martín Santomé",text:"¿En qué situación vital se encuentra Martín Santomé al inicio?",options:["Es un joven que acaba de comenzar su carrera profesional","Es un viudo de mediana edad que cuenta los días para jubilarse, resignado a una vida sin sorpresas","Es un hombre casado que busca una aventura","Es un escritor que busca inspiración para su novela"],correct:1,feedback:"Santomé vive en una rutina que siente irreversible: viudo, padre de hijos adultos, esperando la jubilación como un escape.",feedbackAlt:"Su resignación inicial hace más poderoso el impacto de conocer a Laura."},
      {difficulty:"easy",mode:"fragment",concept:"El amor tardío",text:"¿Qué revela este fragmento sobre la relación entre Santomé y Laura?",fragment:"Ella tiene veinticuatro años. Yo tengo cuarenta y nueve. Hay veinticinco años de diferencia. Debería ser un obstáculo insalvable. Pero cuando estamos juntos, esos veinticinco años desaparecen. O quizás son lo que nos hace tan diferentes y tan necesarios.",options:["Que la diferencia de edad no importa en el amor real","Que Santomé acepta la relación pero también es consciente de su improbabilidad — esa tensión es el núcleo emocional de la novela","Que Laura busca una figura paterna en Santomé","Que la sociedad aprueba su relación"],correct:1,feedback:"Benedetti no niega la improbabilidad: la tensión entre lo que siente y lo que 'debería' sentir es lo que hace a Santomé humano y creíble.",feedbackAlt:"La honestidad de Santomé sobre sus propias dudas es lo que hace que el lector lo acompañe."},
      {difficulty:"medium",mode:"critical",concept:"El título",text:"¿Qué significa 'La tregua' en el contexto de la novela?",options:["Una pausa en la guerra entre generaciones","El período de amor con Laura es una tregua breve en la rutina y la soledad de la vida de Santomé","Una metáfora de la paz política en Uruguay","La tregua que Santomé hace con sus hijos"],correct:1,feedback:"La tregua es el amor: una pausa improbable y breve en una vida de resignación. Cuando termina, la soledad es aún más profunda.",feedbackAlt:"El título ya anticipa que la felicidad será temporal — es una tregua, no una victoria."},
      {difficulty:"medium",mode:"critical",concept:"Contexto social",text:"¿Qué critica Benedetti a través de los personajes secundarios?",options:["La corrupción política directa del gobierno uruguayo","La mediocridad y la hipocresía de la clase media uruguaya que acepta su vacío sin cuestionarlo","La violencia social de los barrios pobres de Montevideo","La falta de educación en Uruguay"],correct:1,feedback:"Los colegas de oficina, los hijos, los vecinos — todos representan una clase media atrapada en convenciones que nunca cuestiona.",feedbackAlt:"Benedetti usa la oficina como microcosmos de la sociedad."},
      {difficulty:"hard",mode:"critical",concept:"El final",text:"¿Por qué el final de la novela es tan devastador?",options:["Porque Santomé muere al final","Porque Laura muere y Santomé debe volver exactamente a la misma vida que tenía antes, pero ahora sabe lo que perdió","Porque los hijos de Santomé descubren la relación y lo rechazan","Porque Laura lo abandona por alguien más joven"],correct:1,feedback:"La tragedia no es solo la muerte de Laura: es que Santomé debe volver a la rutina conociendo ahora el peso de lo que perdió para siempre.",feedbackAlt:"Benedetti no da catarsis. La vida simplemente continúa, más vacía."},
      {difficulty:"hard",mode:"highlight",concept:"La resignación",text:"Subraya la frase que mejor captura la actitud de Santomé antes de conocer a Laura:",fragment:"Me faltan dos años y tres meses para jubilarme. Ya lo he calculado muchas veces: ochocientos cincuenta días. No es que los cuente con ansiedad o con miedo. Los cuento simplemente. Como quien registra el tiempo que falta para que algo termine, sin que importe demasiado qué viene después.",correctHighlight:"sin que importe demasiado qué viene después",options:["Me faltan dos años y tres meses","ochocientos cincuenta días","Los cuento simplemente","sin que importe demasiado qué viene después"],correct:3,feedback:"Esa frase captura la resignación total: Santomé no espera nada de lo que viene — solo el fin de lo que hay.",feedbackAlt:"Esta indiferencia ante el futuro hace que el lector entienda cuánto cambia Laura su mundo interior."},
      {difficulty:"hard",mode:"critical",concept:"Amor y sociedad",text:"¿Por qué la relación Santomé-Laura es una amenaza para el orden social que rodea al protagonista?",options:["Porque es ilegal en Uruguay en 1960","Porque rompe las expectativas de cómo un hombre de su edad y posición 'debería' comportarse y sentir","Porque Laura pertenece a una clase social diferente","Porque Santomé es casado cuando conoce a Laura"],correct:1,feedback:"Benedetti muestra que la sociedad tiene un guión para cada etapa de la vida. Santomé se sale del guión y eso genera incomodidad en todos a su alrededor.",feedbackAlt:"La novela critica cómo la sociedad limita la capacidad de sentir según la edad y el rol social."},
      {difficulty:"easy",mode:"critical",concept:"Los hijos de Santomé",text:"¿Cómo reaccionan los hijos de Santomé ante su relación con Laura?",options:["La apoyan desde el principio","Con incomodidad y resistencia: para ellos es inapropiado que su padre ame a alguien tan joven","Con indiferencia total","Con alegría porque quieren ver a su padre feliz"],correct:1,feedback:"Los hijos encarnan la presión social: lo que 'debería' sentir un hombre de la edad de Santomé según las convenciones.",feedbackAlt:"Benedetti usa la reacción de los hijos para mostrar cuán profundo es el condicionamiento social sobre el amor."},
      {difficulty:"easy",mode:"critical",concept:"La oficina",text:"¿Qué función tiene la oficina como espacio en la novela?",options:["Es el lugar donde Santomé conoce a Laura por primera vez","Es el microcosmos de la vida que Santomé lleva antes y después de Laura: la rutina, los colegas, la mediocridad aceptada","Es un espacio de libertad para Santomé","No tiene relevancia simbólica"],correct:1,feedback:"La oficina es el mundo real de Santomé: gris, predecible, pero también el lugar donde encuentra a Laura.",feedbackAlt:"Benedetti usa la burocracia como símbolo de una vida ordenada que Santomé nunca cuestionó hasta que Laura llegó."},
      {difficulty:"medium",mode:"critical",concept:"La soledad masculina",text:"¿Qué revela la novela sobre la soledad de los hombres de mediana edad?",options:["Que los hombres de esa edad ya no sienten nada","Que detrás de la aparente solidez del rol del padre y funcionario, hay una soledad enorme que la sociedad prohíbe reconocer","Que Santomé es un caso excepcional","Que la soledad es un problema solo de las mujeres"],correct:1,feedback:"Benedetti escribe sobre lo que nadie escribe: la vulnerabilidad emocional de un hombre que el mundo no espera que la tenga.",feedbackAlt:"Santomé expresa en su diario lo que en ningún otro contexto podría decir — esa es la función del diario."},
      {difficulty:"medium",mode:"critical",concept:"Laura como liberación",text:"¿Qué le da Laura a Santomé que nadie más le había dado?",options:["Seguridad económica y estabilidad","La sensación de ser visto y amado sin agenda — sin expectativas de rol, sin distancia profesional ni parental","Reconocimiento social y respeto","Una razón para no jubilarse"],correct:1,feedback:"Con Laura, Santomé puede ser simplemente él — sin roles, sin máscaras de padre o funcionario.",feedbackAlt:"Ese tipo de amor no tiene edad ni convención: simplemente ocurre."},
      {difficulty:"medium",mode:"fragment",concept:"La vulnerabilidad masculina",text:"¿Qué revela este pasaje sobre el personaje interior de Santomé?",fragment:"Escribo esto y siento vergüenza. ¿Qué hace un hombre de cuarenta y nueve años escribiendo estas cosas en un cuaderno? Pero si no lo escribo, no existe. Y necesito que exista.",options:["Que Santomé tiene vergüenza de sí mismo","Que la escritura es el único espacio donde Santomé puede ser auténtico sin ser juzgado, y que sin ese espacio su vida interior desaparecería","Que Santomé debería buscar ayuda psicológica","Que los hombres no deben expresar sentimientos"],correct:1,feedback:"El diario no es vanidad — es supervivencia emocional para un hombre que no tiene otro espacio para existir interiormente.",feedbackAlt:"Benedetti rescata la intimidad masculina que la sociedad patriarcal habitualmente destruye."},
      {difficulty:"medium",mode:"critical",concept:"La muerte de Laura como estructura",text:"¿Por qué Benedetti mata a Laura en lugar de separarla de Santomé de otra manera?",options:["Para crear un final dramático tradicional","Porque la muerte es la única separación que no puede revertirse y que Santomé no puede culparse — hace que el regreso al vacío sea absolutamente inevitable","Para castigar a Santomé por sus sentimientos","Porque era lo más fácil narrativamente"],correct:1,feedback:"Una separación ordinaria dejaría esperanza. La muerte de Laura cierra definitivamente la posibilidad y obliga el regreso total a la vida anterior.",feedbackAlt:"La tregua terminó: el amor era un paréntesis, y Benedetti es brutal al confirmarlo."},
      {difficulty:"hard",mode:"critical",concept:"Benedetti y la clase media",text:"¿Qué tiene de específicamente latinoamericano la crítica de Benedetti a la clase media?",options:["Nada — es una crítica universal sin contexto","Benedetti retrata la clase media uruguaya de los 60: su conformismo, sus aspiraciones pequeñas y su miedo al ridículo, en el contexto de un país que también vive su propia tregua antes de la dictadura","Es una crítica al capitalismo en general","Es una crítica al comunismo"],correct:1,feedback:"Uruguay en 1960 era estable pero frágil. La tregua personal de Santomé espeja la tregua histórica de un país antes de su ruptura.",feedbackAlt:"La dictadura uruguaya llegó en 1973. Benedetti escribía sobre una sociedad que dormía."},
      {difficulty:"hard",mode:"critical",concept:"El diario como forma",text:"¿Qué permite la forma del diario que ninguna otra estructura narrativa permitiría en esta historia?",options:["Más páginas y detalles","Acceso directo a la contradicción interna de Santomé: puede escribir lo que siente y lo que sabe que 'debería' sentir al mismo tiempo, sin resolver la tensión","Una narración más objetiva","Más personajes secundarios"],correct:1,feedback:"El diario es el único formato que puede sostener la ambivalencia de Santomé: la misma entrada puede tener amor y vergüenza.",feedbackAlt:"Ningún narrador externo podría capturar esa contradicción interna sin traicionarla."},
      {difficulty:"medium",mode:"critical",concept:"El estilo de Benedetti",text:"¿Qué caracteriza el estilo literario de Benedetti en La tregua?",options:["Lenguaje rebuscado y metafórico","Lenguaje cotidiano, directo y sin artificio: la prosa imita el pensamiento de un hombre ordinario que no se cree escritor pero necesita escribir para existir","Uso de metáforas surrealistas al estilo del boom latinoamericano","Estilo periodístico sin profundidad"],correct:1,feedback:"Benedetti eligió el estilo diario para que suene auténtico — Santomé no es escritor, solo alguien que necesita poner en papel lo que siente.",feedbackAlt:"Esa aparente sencillez es técnicamente difícil: sonar sin artificios mientras se construye un mundo emocional completo."},
      {difficulty:"hard",mode:"critical",concept:"Uruguay y la tregua histórica",text:"¿Qué paralelo existe entre la 'tregua' de Santomé y la situación de Uruguay en 1960?",options:["No hay ningún paralelo histórico","Uruguay vivía su propia tregua: aparente estabilidad, clase media conformista, antes de la crisis económica y la dictadura de los 70. La novela captura una sociedad que no ve venir su propia ruptura","Uruguay estaba en guerra en 1960","La novela es puramente apolítica"],correct:1,feedback:"Benedetti publicó La tregua en 1960. En 1973, Uruguay cayó bajo una dictadura. La novela captura la calma antes de la tormenta.",feedbackAlt:"Benedetti fue exiliado por la dictadura. Su obra siempre estuvo cerca de la realidad política uruguaya."},
      {difficulty:"hard",mode:"critical",concept:"Santomé como antihéroe",text:"¿Por qué Santomé es un antihéroe y no un héroe romántico?",options:["Porque comete crímenes morales graves","Porque no tiene épica ni grandeza: es un hombre ordinario que tuvo un amor y lo perdió, y eso es todo. Su tragedia es la tragedia de millones de vidas sin historia oficial","Porque es cobarde y huye de sus responsabilidades","Porque el amor que siente no es auténtico"],correct:1,feedback:"La grandeza de La tregua es exactamente esa: una historia pequeña contada con honestidad absoluta que resuena en cualquier vida ordinaria.",feedbackAlt:"Benedetti democratizó la tragedia — no hay que ser Hamlet para tener una historia que valga la pena contar."},
      {difficulty:"hard",mode:"highlight",concept:"El peso del tiempo",text:"Subraya la frase que mejor captura la relación de Santomé con su propia vida antes de Laura:",fragment:"Me faltan dos años y tres meses. Ochocientos cincuenta días. No los cuento con miedo ni con ansia. Los cuento simplemente. Como quien mira caer el agua sin saber para qué cae.",correctHighlight:"Como quien mira caer el agua sin saber para qué cae",options:["Me faltan dos años y tres meses","Ochocientos cincuenta días","No los cuento con miedo ni con ansia","Como quien mira caer el agua sin saber para qué cae"],correct:3,feedback:"Esta imagen captura la indiferencia radical de Santomé: no hay miedo, no hay esperanza, solo la caída automática del tiempo.",feedbackAlt:"Laura interrumpe esa caída. Y cuando ella muere, el agua vuelve a caer exactamente igual."},
    ],
    flashcards:[
      {id:"fc1",front:"¿Qué es 'La tregua' como metáfora?",back:"El amor entre Santomé y Laura: una pausa breve y luminosa en una vida de resignación y rutina que termina con la muerte de ella."},
      {id:"fc2",front:"¿Por qué Benedetti elige el formato de diario?",back:"Para dar acceso directo a los pensamientos más íntimos de Santomé, un hombre que raramente expresa sus emociones en voz alta."},
      {id:"fc3",front:"¿Qué representa la oficina en la novela?",back:"Un microcosmos de la clase media uruguaya: personas atrapadas en convenciones y rutinas que nunca cuestionan."},
      {id:"fc4",front:"¿Por qué el final es devastador?",back:"Santomé debe volver exactamente a su vida anterior, pero ahora sabe lo que perdió. La rutina continúa, más vacía que antes."},
    ],
    debatePrompts:[{id:"tregua-d1",question:"¿El amor de Santomé por Laura es genuino o es una crisis de mediana edad disfrazada de amor?",context:"Santomé tiene 49 años, está a punto de jubilarse y conoce a una mujer 25 años menor. ¿Eso hace menos real lo que siente?"}],
    forumId:"tregua-forum"
  },
];

// ── Firebase helpers ──────────────────────────────────────────────────────────
async function loadStats(uid: string): Promise<Stats> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return DEFAULT_STATS;
  return { ...DEFAULT_STATS, ...(snap.data() as Partial<Stats>) };
}
async function awardPoints(uid: string, pts: number) {
  try { await updateDoc(doc(db, "users", uid), { points: increment(pts) }); } catch {}
}

// ── LoginModal ────────────────────────────────────────────────────────────────
function LoginModal({ onClose, onLogin }: { onClose: () => void; onLogin: (u: User) => void }) {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError("");
    try {
      const cred = isSignup
        ? await createUserWithEmailAndPassword(auth, email, password)
        : await signInWithEmailAndPassword(auth, email, password);
      onLogin(cred.user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setError(msg.replace("Firebase: ","").replace(/\(auth.*\)\.?/,""));
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter:"blur(4px)" }} onClick={onClose}>
      <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-6 border" style={{ background:"#1E0E04", borderColor:"#3D1F0A" }} onClick={e=>e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full mx-auto mb-4 sm:hidden" style={{ background:"#3D1F0A" }} />
        <div className="text-center mb-5">
          <span className="font-display text-2xl font-bold" style={{ color:"#D4A853" }}>Análisis</span>
          <p className="text-xs mt-1" style={{ color:"#5C3518" }}>Inicia sesión para guardar tu progreso</p>
        </div>
        <div className="flex rounded-xl overflow-hidden mb-5 border" style={{ borderColor:"#3D1F0A" }}>
          {["Entrar","Registrarse"].map((tab,i) => (
            <button key={tab} onClick={() => setIsSignup(i===1)} className="flex-1 py-2.5 text-sm font-medium transition-colors" style={{ background: isSignup===(i===1)?"#D4A853":"transparent", color: isSignup===(i===1)?"#120A04":"#5C3518" }}>{tab}</button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-3">
          <input value={email} onChange={e=>setEmail(e.target.value)} type="email" required className="w-full rounded-xl px-4 py-3 text-sm outline-none border" style={{ background:"#120A04", borderColor:"#3D1F0A", color:"#F5ECD7" }} placeholder="correo@ejemplo.com" />
          <input value={password} onChange={e=>setPassword(e.target.value)} type="password" required className="w-full rounded-xl px-4 py-3 text-sm outline-none border" style={{ background:"#120A04", borderColor:"#3D1F0A", color:"#F5ECD7" }} placeholder="••••••••" />
          {error && <p className="text-xs rounded-lg px-3 py-2" style={{ background:"rgba(139,26,26,0.3)", color:"#F08080" }}>{error}</p>}
          <button type="submit" disabled={loading} className="w-full py-3 rounded-xl font-bold text-sm" style={{ background:"#D4A853", color:"#120A04", opacity:loading?0.7:1 }}>
            {loading?"Procesando…":isSignup?"Crear cuenta":"Iniciar sesión"}
          </button>
        </form>
        <button onClick={onClose} className="w-full mt-3 py-2 text-sm" style={{ color:"#5C3518" }}>Continuar sin sesión</button>
      </div>
    </div>
  );
}

// ── Bottom Tab Nav ─────────────────────────────────────────────────────────────
type Tab = "library" | "manual" | "profile";
function BottomNav({ tab, onChange, user }: { tab: Tab; onChange: (t: Tab) => void; user: User|null }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t flex sm:hidden" style={{ background:"rgba(18,10,4,0.98)", backdropFilter:"blur(12px)", borderColor:"#2A1408" }}>
      {([["library","📚","Biblioteca"],["manual","▤","Manual"],["profile","👤","Perfil"]] as [Tab,string,string][]).map(([t,icon,label]) => (
        <button key={t} onClick={() => onChange(t)} className="flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors" style={{ color: tab===t?"#D4A853":"#3D1F0A" }}>
          <span className="text-xl">{icon}</span>
          <span className="text-xs font-medium">{label}</span>
          {tab===t && <div className="w-4 h-0.5 rounded-full" style={{ background:"#D4A853" }} />}
        </button>
      ))}
    </nav>
  );
}

// ── DesktopNav ────────────────────────────────────────────────────────────────
function DesktopNav({ tab, onChange, user, onLoginClick, onLogout }: { tab: Tab; onChange: (t: Tab) => void; user: User|null; onLoginClick: () => void; onLogout: () => void }) {
  return (
    <header className="hidden sm:flex sticky top-0 z-40 border-b" style={{ background:"rgba(18,10,4,0.95)", backdropFilter:"blur(8px)", borderColor:"#2A1408" }}>
      <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 w-full flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-display text-2xl font-bold" style={{ color:"#D4A853" }}>Análisis</span>
          <div className="flex gap-1">
            {([["library","📚 Biblioteca"],["manual","▤ Manual"],["profile","👤 Perfil"]] as [Tab,string][]).map(([t,label]) => (
              <button key={t} onClick={() => onChange(t)} className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors" style={{ background:tab===t?"#2A1408":"transparent", color:tab===t?"#D4A853":"#5C3518" }}>{label}</button>
            ))}
          </div>
        </div>
        <div>
          {user ? (
            <button onClick={onLogout} className="px-4 py-1.5 rounded-lg text-xs border transition-colors hover:border-amber-800" style={{ borderColor:"#3D1F0A", color:"#5C3518" }}>Cerrar sesión</button>
          ) : (
            <button onClick={onLoginClick} className="px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90" style={{ background:"#D4A853", color:"#120A04" }}>Iniciar sesión</button>
          )}
        </div>
      </div>
    </header>
  );
}

// ── Analyst Manual ────────────────────────────────────────────────────────────
const MANUAL_CATEGORIES = [
  {
    id:"bias", label:"1. Sesgos", summary:"Descubre quién intenta orientar tu lectura.",
    items:[
      { title:"La Agenda Oculta", mechanic:"Relaciona un mensaje con el actor que obtiene poder si ese mensaje se acepta.", example:"«Solo la versión oficial garantiza el orden». El gobierno evita que otras voces cuestionen sus decisiones.", steps:["Subraya la afirmación que se presenta como inevitable.","Identifica qué actores ganan o pierden poder.","Elige al beneficiario directo, no al actor más visible."] },
      { title:"Cartas de Falacia", mechanic:"Clasifica el atajo lógico que reemplaza a una prueba válida.", example:"«No escuches su interpretación: ni siquiera entendió el libro» ataca al lector, no a su argumento.", steps:["Separa la conclusión de las razones.","Pregunta si las razones realmente prueban la conclusión.","Compara el defecto con la definición de cada carta."] },
    ],
  },
  {
    id:"strength", label:"2. Solidez", summary:"Comprueba si una conclusión resiste evidencia contraria.",
    items:[
      { title:"Prueba de Estrés", mechanic:"Lanza el dato que golpea directamente la premisa principal.", example:"Para refutar «todos actúan igual», un solo contraejemplo es más fuerte que diez datos de contexto.", steps:["Localiza la palabra absoluta: todos, nunca, siempre.","Busca una hipótesis que contradiga esa universalidad.","Descarta datos ciertos que no cambian la conclusión."] },
      { title:"Arquitectura Argumentativa", mechanic:"Ordena evidencia, inferencia y conclusión para reconstruir la lógica.", example:"Hecho observable → interpretación del hecho → tesis que se quiere defender.", steps:["Empieza por lo que puede comprobarse.","Continúa con la conexión razonada.","Termina con la afirmación más amplia."] },
    ],
  },
  {
    id:"transfer", label:"3. Transferencia", summary:"Aplica una idea a nuevos contextos sin deformarla.",
    items:[
      { title:"Match de Posturas", mechanic:"Conecta conceptos con interpretaciones que conservan sus matices.", example:"Vigilancia no equivale simplemente a tecnología: importa quién observa, con qué poder y para qué.", steps:["Define cada concepto con tus palabras.","Elimina conexiones demasiado generales.","Comprueba que ninguna respuesta sirva igual para todo."] },
      { title:"Veredictos Rápidos", mechanic:"Decide si una frase contiene argumento o solo una afirmación segura de sí misma.", example:"«Aparece muchas veces, por lo tanto causa todo» confunde repetición con causalidad.", steps:["Busca una razón identificable.","Comprueba el vínculo con la conclusión.","Desliza según exista o no sustento suficiente."] },
    ],
  },
  {
    id:"meta", label:"4. Metacognición", summary:"Observa cómo las palabras intentan decidir por ti.",
    items:[
      { title:"Filtro de Ruido", mechanic:"Tacha adjetivos manipulativos para recuperar el dato objetivo.", example:"«La desastrosa e intolerable decisión ocurrió el lunes» → «La decisión ocurrió el lunes».", steps:["Conserva nombres, acciones, fechas y cantidades.","Tacha palabras que ordenan sentir aprobación o rechazo.","Relee el resultado y pregunta qué evidencia falta."] },
      { title:"Inspector de Evidencia", mechanic:"Distingue una prueba concreta de una opinión o una conclusión.", example:"Una escena observable es evidencia; decir «esto demuestra que es malo» ya es interpretación.", steps:["Busca aquello que otro lector podría verificar.","Evita frases que solo valoran.","Comprueba si la evidencia respalda exactamente la tesis."] },
    ],
  },
];

function ManualScreen() {
  const [category, setCategory] = useState(MANUAL_CATEGORIES[0].id);
  const [openItem, setOpenItem] = useState<string|null>(MANUAL_CATEGORIES[0].items[0].title);
  const active = MANUAL_CATEGORIES.find(item=>item.id===category)??MANUAL_CATEGORIES[0];
  return (
    <div className="min-h-screen pb-24 sm:pb-10 screen-enter" style={{ background:"#120A04" }}>
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10">
        <div className="rounded-3xl border p-5 sm:p-7 mb-5" style={{ background:"linear-gradient(145deg,#1E0E04,#2A1408)", borderColor:"#3D1F0A" }}>
          <p className="text-xs tracking-[0.25em] uppercase mb-2" style={{ color:"#D4A853" }}>Codex de campo</p>
          <h1 className="font-display text-3xl font-black mb-2" style={{ color:"#F5ECD7" }}>Manual del Analista</h1>
          <p className="text-sm leading-relaxed max-w-xl" style={{ color:"#7A5C3E" }}>Estudia cada herramienta antes de abrir un expediente. Aquí no memorizas respuestas: aprendes qué observar, qué descartar y cómo justificar un veredicto.</p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {MANUAL_CATEGORIES.map(item=>(
            <button key={item.id} onClick={()=>{setCategory(item.id);setOpenItem(item.items[0].title);}} className="whitespace-nowrap px-3.5 py-2.5 rounded-xl border text-xs font-bold" style={{ background:category===item.id?"#D4A853":"#1A0C04", borderColor:category===item.id?"#D4A853":"#2A1408", color:category===item.id?"#120A04":"#7A5C3E" }}>{item.label}</button>
          ))}
        </div>
        <div className="rounded-2xl border p-4 mb-3" style={{ background:"#1A0C04", borderColor:"#2A1408" }}>
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color:"#5C3518" }}>Objetivo del módulo</p>
          <p className="text-sm" style={{ color:"#EDE0C4" }}>{active.summary}</p>
        </div>
        <div className="space-y-3">
          {active.items.map(item=>{
            const open=openItem===item.title;
            return (
              <div key={item.title} className="rounded-2xl border overflow-hidden" style={{ background:"#1A0C04", borderColor:open?"#5C3518":"#2A1408" }}>
                <button onClick={()=>setOpenItem(open?null:item.title)} className="w-full p-4 text-left flex items-center justify-between gap-4">
                  <div><p className="font-display font-bold" style={{ color:"#F5ECD7" }}>{item.title}</p><p className="text-xs mt-1" style={{ color:"#7A5C3E" }}>{item.mechanic}</p></div>
                  <span className="text-xl" style={{ color:"#D4A853" }}>{open?"−":"+"}</span>
                </button>
                {open && (
                  <div className="px-4 pb-4 screen-enter">
                    <div className="rounded-xl border p-3 mb-3" style={{ background:"#120A04", borderColor:"#3D1F0A" }}>
                      <p className="text-xs uppercase tracking-widest mb-1" style={{ color:"#D4A853" }}>Ejemplo práctico</p>
                      <p className="text-sm leading-relaxed" style={{ color:"#EDE0C4" }}>{item.example}</p>
                    </div>
                    <p className="text-xs uppercase tracking-widest mb-2" style={{ color:"#5C3518" }}>Cómo resolverlo</p>
                    <div className="space-y-2">
                      {item.steps.map((step,index)=><div key={step} className="flex gap-3 text-sm"><span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ background:"rgba(212,168,83,0.12)", color:"#D4A853" }}>{index+1}</span><p style={{ color:"#7A5C3E" }}>{step}</p></div>)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── ProfileScreen ─────────────────────────────────────────────────────────────
function ProfileScreen({ user, stats, onLoginClick, onLogout }: { user: User|null; stats: Stats; onLoginClick: () => void; onLogout: () => void }) {
  const earned = stats.completedBooksHard ?? [];
  const masteredCount = BOOKS.filter(book=>["easy","medium","hard"].every(level=>(stats.completedLevels??[]).includes(`${book.id}:${level}`))).length;
  const allBadges = BOOKS.map(b => ({
    book: b,
    earned: earned.includes(b.id),
  }));

  const statItems = [
    { label:"Racha actual", value:`${stats.streak} días`, icon:"🔥" },
    { label:"Puntos totales", value:`${stats.points}`, icon:"⭐" },
    { label:"Libros al 100%", value:`${masteredCount}`, icon:"📖" },
    { label:"Medallas", value:`${earned.length} / ${BOOKS.length}`, icon:"🏅" },
    { label:"Debates publicados", value:`${stats.totalDebates??0}`, icon:"⚖️" },
    { label:"Posts en foro", value:`${stats.totalForumPosts??0}`, icon:"💬" },
  ];

  return (
    <div className="min-h-screen pb-20 sm:pb-8 screen-enter" style={{ background:"#120A04" }}>
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10">
        {!user ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">👤</div>
            <h2 className="font-display text-3xl font-bold mb-2" style={{ color:"#F5ECD7" }}>Tu perfil</h2>
            <p className="mb-6 text-sm" style={{ color:"#5C3518" }}>Inicia sesión para ver tu racha, puntos y logros guardados</p>
            <button onClick={onLoginClick} className="px-8 py-3 rounded-2xl font-bold text-base transition-all hover:opacity-90" style={{ background:"#D4A853", color:"#120A04" }}>Iniciar sesión / Registrarse</button>
          </div>
        ) : (
          <>
            {/* Avatar + name */}
            <div className="flex items-center gap-4 mb-8">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold" style={{ background:"#2A1408", color:"#D4A853", border:"2px solid #3D1F0A" }}>
                {user.email?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div>
                <h2 className="font-display text-xl font-bold" style={{ color:"#F5ECD7" }}>{user.email?.split("@")[0]}</h2>
                <p className="text-xs" style={{ color:"#5C3518" }}>{user.email}</p>
                {stats.streak >= 7 && <span className="text-xs px-2 py-0.5 rounded-full mt-1 inline-block" style={{ background:"rgba(212,168,83,0.15)", color:"#D4A853" }}>🔥 ¡Racha de {stats.streak} días!</span>}
              </div>
              <button onClick={onLogout} className="ml-auto text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor:"#2A1408", color:"#5C3518" }}>Salir</button>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
              {statItems.map(({ label, value, icon }) => (
                <div key={label} className="rounded-2xl p-4 border" style={{ background:"#1A0C04", borderColor:"#2A1408" }}>
                  <div className="text-2xl mb-1">{icon}</div>
                  <div className="font-display text-2xl font-bold" style={{ color:"#D4A853" }}>{value}</div>
                  <div className="text-xs mt-0.5" style={{ color:"#5C3518" }}>{label}</div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border p-5 mb-8" style={{ background:"linear-gradient(135deg,rgba(212,168,83,0.1),#1A0C04)", borderColor:"#3D1F0A" }}>
              <p className="text-xs tracking-widest uppercase mb-2" style={{ color:"#D4A853" }}>Tu respuesta con más apoyos</p>
              {stats.bestDebateResponse ? (
                <>
                  <p className="text-sm leading-relaxed mb-3" style={{ color:"#EDE0C4" }}>“{stats.bestDebateResponse.text}”</p>
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color:"#7A5C3E" }}>{stats.bestDebateResponse.bookTitle}</span>
                    <span className="font-bold" style={{ color:"#D4A853" }}>{stats.bestDebateResponse.likes} me gusta</span>
                  </div>
                </>
              ) : (
                <p className="text-sm" style={{ color:"#5C3518" }}>Publica un argumento en un debate. Aquí aparecerá el que reciba más apoyo.</p>
              )}
            </div>

            {/* Streak bar */}
            <div className="rounded-2xl border p-5 mb-8" style={{ background:"#1A0C04", borderColor:"#2A1408" }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm" style={{ color:"#F5ECD7" }}>Racha semanal</h3>
                <span className="flame text-xl">🔥</span>
              </div>
              <div className="flex gap-1.5">
                {["L","M","X","J","V","S","D"].map((d,i) => (
                  <div key={d} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full aspect-square rounded-lg" style={{ background: i < (stats.streak % 7 || 7) ? "#D4A853" : "#2A1408" }} />
                    <span className="text-xs" style={{ color:"#3D1F0A" }}>{d}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Badges */}
            <div>
              <h3 className="font-display text-lg font-semibold mb-4" style={{ color:"#F5ECD7" }}>
                Medallas <span style={{ color:"#5C3518", fontSize:"0.8em" }}>· completa en Difícil para ganar</span>
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {allBadges.map(({ book, earned: e }) => (
                  <div key={book.id} className="rounded-2xl border p-3 text-center transition-all" style={{ background: e?"#1E0E04":"#120A04", borderColor: e?book.color:"#1A0A04", opacity: e?1:0.5 }}>
                    {typeof book.badgeIcon === "string" && (book.badgeIcon.includes("/") || book.badgeIcon.startsWith("data:")) ? (
                      <img src={book.badgeIcon} className="w-10 h-10 object-contain mb-1.5 rounded" />
                    ) : (
                      <div className="text-3xl mb-1.5">{book.badgeIcon}</div>
                    )}
                    <div className="text-xs font-semibold" style={{ color: e?"#D4A853":"#3D1F0A" }}>{book.badgeName}</div>
                    <div className="text-xs mt-0.5 truncate" style={{ color: e?book.color:"#2A1408" }}>{book.title}</div>
                    {e && <div className="text-xs mt-1" style={{ color:"#5C8A3E" }}>✓ Obtenida</div>}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── HomeScreen ────────────────────────────────────────────────────────────────
function HomeScreen({ user, stats, onBook }: { user: User|null; stats: Stats; onBook: (b: Book) => void }) {
  const isMastered = (book: Book) => ["easy","medium","hard"].every(level => (stats.completedLevels??[]).includes(`${book.id}:${level}`));
  const masteredBooks = BOOKS.filter(isMastered);
  const pendingBooks = BOOKS.filter(book=>!isMastered(book));
  return (
    <div className="min-h-screen pb-20 sm:pb-8 screen-enter" style={{ background:"#120A04" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        {/* Hero */}
        <div className="rounded-2xl overflow-hidden mb-8 relative" style={{ background:"linear-gradient(135deg,#2A1408,#3D1F0A)", border:"1px solid #3D1F0A" }}>
          <div className="px-6 py-8 sm:px-10 sm:py-10">
            <p className="text-xs tracking-[0.25em] uppercase mb-1" style={{ color:"#5C3518" }}>AÑO I · NÚMERO 01</p>
            <h2 className="font-display text-4xl sm:text-5xl font-black mb-1" style={{ color:"#F5ECD7" }}>Análisis</h2>
            <p className="font-display text-base italic mb-4" style={{ color:"#D4A853" }}>la lectura como pensamiento</p>
            <div className="flex flex-wrap gap-2">
              {user ? (
                <>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm" style={{ background:"rgba(212,168,83,0.12)", color:"#D4A853", border:"1px solid rgba(212,168,83,0.2)" }}>🔥 {stats.streak} días de racha</div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm" style={{ background:"rgba(212,168,83,0.08)", color:"#7A5C3E", border:"1px solid #3D1F0A" }}>⭐ {stats.points} pts</div>
                </>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm" style={{ background:"rgba(212,168,83,0.08)", color:"#5C3518", border:"1px solid #3D1F0A" }}>📖 {BOOKS.length} obras · Ingresa para guardar progreso</div>
              )}
            </div>
          </div>
        </div>

        {[
          { title:"Por investigar", subtitle:"Completa Fácil, Medio y Difícil", books:pendingBooks, mastered:false },
          { title:"Archivo dominado", subtitle:"Obras completadas al 100%", books:masteredBooks, mastered:true },
        ].map(section => (
          <section key={section.title} className="mb-7">
            <div className="flex items-end justify-between mb-3">
              <div>
                <h3 className="font-display text-xl font-semibold" style={{ color:section.mastered?"#D4A853":"#F5ECD7" }}>{section.title}</h3>
                <p className="text-xs mt-0.5" style={{ color:"#5C3518" }}>{section.subtitle}</p>
              </div>
              <span className="text-xs" style={{ color:"#7A5C3E" }}>{section.books.length} obras</span>
            </div>
            <div className="relative rounded-2xl overflow-hidden py-5 sm:py-7 min-h-48" style={{ background:section.mastered?"linear-gradient(135deg,#221404,#1A0A04)":"#1A0A04", border:`1px solid ${section.mastered?"#5C3518":"#2A1408"}` }}>
              <div className="absolute bottom-0 left-0 right-0 h-3 sm:h-4" style={{ background:section.mastered?"#7A5424":"#3D1F0A", boxShadow:"0 4px 16px rgba(0,0,0,0.5)" }} />
              {section.books.length ? (
                <div className="flex items-end gap-2 sm:gap-3 lg:gap-5 px-5 sm:px-8 pb-3 sm:pb-4 overflow-x-auto">
                  {section.books.map(book => <BookSpine key={book.id} book={book} completed={section.mastered} onClick={() => onBook(book)} />)}
                </div>
              ) : (
                <div className="h-36 flex flex-col items-center justify-center text-center px-6">
                  <div className="w-10 h-10 rounded-full border flex items-center justify-center mb-2" style={{ borderColor:"#5C3518", color:"#D4A853" }}>✦</div>
                  <p className="text-sm" style={{ color:"#7A5C3E" }}>Tu primer sello dorado aparecerá aquí.</p>
                  <p className="text-xs mt-1" style={{ color:"#3D1F0A" }}>Supera los tres niveles de una obra.</p>
                </div>
              )}
            </div>
          </section>
        ))}

        {/* List */}
        <h3 className="font-display text-sm sm:text-base font-medium mb-3 mt-6" style={{ color:"#5C3518", letterSpacing:"0.1em", textTransform:"uppercase" }}>Todas las obras</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {BOOKS.map(book => (
            <button key={book.id} onClick={() => onBook(book)} className="flex items-center gap-3 px-4 py-3.5 sm:py-4 rounded-xl border text-left transition-all hover:border-amber-900 group" style={{ background:"#1A0C04", borderColor:"#2A1408" }}>
              <div className="w-1.5 h-10 rounded-full flex-shrink-0" style={{ background:book.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm sm:text-base truncate" style={{ color:"#F5ECD7" }}>{book.title}</span>
                  {isMastered(book) && <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-bold" style={{ background:"rgba(212,168,83,0.15)", color:"#D4A853" }}>100%</span>}
                </div>
                <span className="text-xs sm:text-sm" style={{ color:"#5C3518" }}>{book.author} · {book.year}</span>
              </div>
              <span className="text-lg sm:text-xl flex-shrink-0" style={{ color:"#3D1F0A" }}>›</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function BookSpine({ book, completed, onClick }: { book: Book; completed: boolean; onClick: () => void }) {
  return (
    <div className="book-spine cursor-pointer flex-shrink-0" onClick={onClick} title={book.title}>
      <div className="spine-inner rounded-sm flex flex-col items-center justify-between py-2 relative" style={{ width:"clamp(44px,4.5vw,64px)", height:"clamp(150px,16vw,220px)", background:book.color, borderLeft:`5px solid ${book.spine}`, boxShadow:"3px 6px 18px rgba(0,0,0,0.6)" }}>
        {completed && <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-xs z-10 font-bold" style={{ background:"#D4A853", color:"#120A04" }}>✓</div>}
        <div className="flex-1 flex items-center justify-center overflow-hidden px-1" style={{ writingMode:"vertical-rl", transform:"rotate(180deg)" }}>
          <span className="font-display font-bold text-center leading-tight" style={{ color:"rgba(255,255,255,0.95)", fontSize:"clamp(10px,1.1vw,14px)" }}>{book.title}</span>
        </div>
        <span style={{ fontSize:"clamp(8px,0.8vw,11px)", color:"rgba(255,255,255,0.6)", writingMode:"vertical-rl", transform:"rotate(180deg)" }}>{book.author.split(" ").pop()}</span>
      </div>
    </div>
  );
}

// ── BookDetailScreen ──────────────────────────────────────────────────────────
type BookMode = "quiz"|"flashcards"|"debate"|"forum";
function BookDetailScreen({ book, stats, onMode, onBack }: { book: Book; stats: Stats; onMode: (m: BookMode) => void; onBack: () => void }) {
  const completed = ["easy","medium","hard"].every(level=>(stats.completedLevels??[]).includes(`${book.id}:${level}`));
  const medalEarned = (stats.completedBooksHard??[]).includes(book.id);
  const experience = getBookExperience(book);
  const completedLevels = (stats.completedLevels??[]).filter(level=>level.startsWith(`${book.id}:`)).length;
  return (
    <div className="min-h-screen pb-20 sm:pb-8 screen-enter" style={{ background:"#120A04" }}>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button onClick={onBack} className="flex items-center gap-2 text-sm mb-5 transition-colors hover:opacity-70" style={{ color:"#7A5C3E" }}>‹ Biblioteca</button>
        {/* Header */}
        <div className="rounded-2xl overflow-hidden mb-6 border" style={{ background:"#1E0E04", borderColor:"#3D1F0A" }}>
          <div className="h-1.5" style={{ background:`linear-gradient(90deg,${book.color},${book.spine})` }} />
          <div className="p-5 sm:p-7 flex gap-5 items-start">
            <div className="rounded flex-shrink-0 shadow-lg" style={{ width:52, height:80, background:book.color, borderLeft:`6px solid ${book.spine}` }} />
            <div>
              <p className="text-xs tracking-widest uppercase mb-1" style={{ color:"#5C3518" }}>{book.genre} · {book.year}</p>
              <h1 className="font-display text-2xl sm:text-3xl font-black mb-1" style={{ color:"#F5ECD7" }}>{book.title}</h1>
              <p className="text-sm mb-2" style={{ color:"#7A5C3E" }}>{book.author}</p>
              <p className="text-sm italic" style={{ color:"#D4A853" }}>"{book.tagline}"</p>
            </div>
          </div>
          <div className="grid grid-cols-3 border-t" style={{ borderColor:"#2A1408" }}>
            {[
              ["Ruta", completed?"Completada":"Pendiente"],
              ["Tarjetas", `${book.flashcards.length}+`],
              ["Medalla", medalEarned?"Obtenida":"Por ganar"],
            ].map(([label,value]) => (
              <div key={label} className="px-3 py-3 text-center border-r last:border-r-0" style={{ borderColor:"#2A1408" }}>
                <div className="text-xs mb-0.5" style={{ color:"#5C3518" }}>{label}</div>
                <div className="text-xs font-semibold" style={{ color:"#D4A853" }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-[1.35fr_1fr] gap-3 mb-6">
          <div className="rounded-2xl border p-4" style={{ background:"#1A0C04", borderColor:"#2A1408" }}>
            <p className="text-xs tracking-widest uppercase mb-2" style={{ color:"#5C3518" }}>De qué trata</p>
            <p className="text-sm leading-relaxed" style={{ color:"#EDE0C4" }}>{experience.description}</p>
          </div>
          <div className="rounded-2xl border p-4" style={{ background:`linear-gradient(135deg,${book.color}22,#1A0C04)`, borderColor:book.color+"55" }}>
            <p className="text-xs tracking-widest uppercase mb-2" style={{ color:"#5C3518" }}>Tu rol</p>
            <p className="font-display font-bold mb-1" style={{ color:"#D4A853" }}>{experience.role}</p>
            <p className="text-xs leading-relaxed" style={{ color:"#7A5C3E" }}>{experience.setting}</p>
          </div>
        </div>

        <div className="flex items-end justify-between gap-4 mb-3">
          <div>
            <p className="text-xs tracking-widest uppercase mb-1" style={{ color:"#5C3518" }}>Mesa de estudio</p>
            <h2 className="font-display text-xl font-semibold" style={{ color:"#F5ECD7" }}>Profundiza en la obra</h2>
          </div>
          <span className="text-xs text-right" style={{ color:"#5C3518" }}>{completedLevels}/3 niveles superados</span>
        </div>

        {/* Primary CTA: Quiz */}
        <button onClick={() => onMode("quiz")} className="w-full rounded-2xl p-5 mb-3 text-left transition-all hover:scale-[1.01] active:scale-[0.99] border relative overflow-hidden" style={{ background:`linear-gradient(135deg,${book.color}22,${book.color}11)`, borderColor:book.color+"55" }}>
          <div className="absolute inset-0 opacity-5" style={{ background:`linear-gradient(135deg,${book.color},transparent)` }} />
          <div className="relative flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0" style={{ background:book.color+"33" }}>🧠</div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-display font-bold text-lg" style={{ color:"#F5ECD7" }}>Quiz Crítico</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background:"#D4A853", color:"#120A04" }}>Principal</span>
              </div>
              <p className="text-sm" style={{ color:"#7A5C3E" }}>Evidencia, falacias, orden lógico y posturas</p>
              <p className="text-xs mt-1" style={{ color:"#5C3518" }}>5 fácil · 8 medio · 11 difícil</p>
            </div>
            <span className="text-2xl" style={{ color:book.color }}>›</span>
          </div>
        </button>

        {/* Secondary modes */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            {mode:"flashcards",icon:"▤",title:"Flashcards",desc:`${book.flashcards.length} del libro + las tuyas`,color:"#D4A853"},
            {mode:"debate",icon:"⚖️",title:"Debate",desc:"Argumenta y compite por likes",color:"#7A3A9A"},
            {mode:"forum",icon:"💬",title:"Foro",desc:"Preguntas y respuestas",color:"#1A6A8A"},
          ] as {mode:BookMode,icon:string,title:string,desc:string,color:string}[]).map(({mode,icon,title,desc,color}) => (
            <button key={mode} onClick={() => onMode(mode)} className="text-left rounded-2xl p-4 border transition-all hover:scale-[1.02] active:scale-[0.98]" style={{ background:"#1A0C04", borderColor:"#2A1408" }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3" style={{ background:color+"22" }}>{icon}</div>
              <div className="font-semibold text-sm mb-1" style={{ color }}>{title}</div>
              <div className="text-xs" style={{ color:"#5C3518" }}>{desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── QuizDifficultyScreen ──────────────────────────────────────────────────────
function QuizDifficultyScreen({ book, onSelect, onBack }: { book: Book; onSelect: (d: Difficulty) => void; onBack: () => void }) {
  const counts = {
    easy: book.questions.filter(q => q.difficulty === "easy").length,
    medium: book.questions.filter(q => q.difficulty === "medium").length,
    hard: book.questions.filter(q => q.difficulty === "hard").length,
  };
  const nMap: Record<Difficulty,number> = { easy:5, medium:8, hard:11 };
  const difficulties: { d: Difficulty; label: string; emoji: string; color: string; bg: string; pts: string; note: string }[] = [
    { d:"easy", label:"Fácil", emoji:"🌱", color:"#5C8A3E", bg:"rgba(92,138,62,0.15)", pts:"+8 pts/correcta", note:"Conceptos básicos · 5 preguntas" },
    { d:"medium", label:"Medio", emoji:"⚡", color:"#D4A853", bg:"rgba(212,168,83,0.12)", pts:"+10 pts/correcta", note:"Evidencia y estructura · 8 preguntas" },
    { d:"hard", label:"Difícil", emoji:"💀", color:"#C87941", bg:"rgba(200,121,65,0.15)", pts:"+15 pts/correcta · Medalla si perfecto", note:"Síntesis, posturas y falacias · 11 preguntas" },
  ];
  return (
    <div className="min-h-screen pb-20 sm:pb-8 screen-enter" style={{ background:"#120A04" }}>
      <div className="max-w-lg mx-auto px-4 py-6">
        <button onClick={onBack} className="flex items-center gap-2 text-sm mb-5 hover:opacity-70" style={{ color:"#7A5C3E" }}>‹ {book.title}</button>
        <h2 className="font-display text-2xl font-bold mb-1" style={{ color:"#F5ECD7" }}>Elige la dificultad</h2>
        <p className="text-sm mb-6 flex items-center gap-1.5" style={{ color:"#5C3518" }}>Completa en Difícil con puntaje perfecto para ganar la medalla {book.badgeIcon.startsWith?.("/")||book.badgeIcon.startsWith?.("data:") ? <img src={book.badgeIcon} className="w-5 h-5 object-contain inline rounded" /> : book.badgeIcon}</p>
        <div className="space-y-3">
          {difficulties.map(({ d, label, emoji, color, bg, pts, note }) => (
            <button key={d} onClick={() => onSelect(d)} className="w-full text-left rounded-2xl border p-5 transition-all hover:scale-[1.01] active:scale-[0.99]" style={{ background:bg, borderColor:color+"44" }}>
              <div className="flex items-center gap-4">
                <span className="text-3xl">{emoji}</span>
                <div className="flex-1">
                  <span className="font-display font-bold text-lg" style={{ color }}>{label}</span>
                  <p className="text-xs mt-0.5" style={{ color:"#7A5C3E" }}>{note}</p>
                  <p className="text-xs mt-1 font-medium" style={{ color }}>{pts}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-bold" style={{ color }}>{nMap[d]}</div>
                  <div className="text-xs" style={{ color:"#5C3518" }}>preguntas</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── QuizScreen ────────────────────────────────────────────────────────────────
function QuizScreen({ book, user, stats, difficulty, onDone, onBack }: { book: Book; user: User|null; stats: Stats; difficulty: Difficulty; onDone: (pts: number, perfect: boolean) => void; onBack: () => void }) {
  const ptsMap: Record<Difficulty,number> = { easy:8, medium:10, hard:15 };
  const nMap: Record<Difficulty,number> = { easy:5, medium:8, hard:11 };
  const N = nMap[difficulty];
  const [questions] = useState(() => buildQuizQuestions(book, difficulty));
  const [current, setCurrent] = useState(0); const [selected, setSelected] = useState<number|null>(null);
  const [answered, setAnswered] = useState(false); const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false); const [highlight, setHighlight] = useState<string|null>(null);
  const [started, setStarted] = useState(false); const [showHint, setShowHint] = useState(false);
  const [ordered, setOrdered] = useState<string[]>([]);
  const [matches, setMatches] = useState<Record<string,string>>({});
  const [activeMatch, setActiveMatch] = useState<string|null>(null);
  const [swipeStart, setSwipeStart] = useState<number|null>(null);
  const [noiseSelected, setNoiseSelected] = useState<string[]>([]);
  const [hintCard, setHintCard] = useState<Flashcard|null>(null);
  const q = questions[current];
  const experience = getBookExperience(book);
  const isHL = q.mode === "highlight";
  const pct = ((current+(answered?1:0))/N)*100;

  function completeAnswer(isCorrect: boolean) {
    if (answered) return;
    setAnswered(true);
    if (isCorrect) setScore(s=>s+1);
  }
  function choose(i: number) {
    if (answered) return; setSelected(i); completeAnswer(i===q.correct);
  }
  function chooseHL(s: string) {
    if (answered) return; setHighlight(s); completeAnswer(s===q.correctHighlight);
  }
  function submitOrder() {
    const correctOrder = q.orderItems??[];
    completeAnswer(ordered.every((item,index) => item===correctOrder[index]));
  }
  function connectMatch(right: string) {
    if (!activeMatch || answered) return;
    setMatches(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => { if (next[key]===right) delete next[key]; });
      next[activeMatch] = right;
      return next;
    });
    setActiveMatch(null);
  }
  function submitMatches() {
    completeAnswer((q.matchPairs??[]).every(pair => matches[pair.left]===pair.right));
  }
  function submitNoise() {
    const expected=q.noiseWords??[];
    completeAnswer(noiseSelected.length===expected.length && expected.every(word=>noiseSelected.includes(word)));
  }
  function next() {
    if (current<N-1) {
      setCurrent(c=>c+1); setSelected(null); setAnswered(false); setHighlight(null);
      setOrdered([]); setMatches({}); setActiveMatch(null); setSwipeStart(null); setNoiseSelected([]); setHintCard(null); setShowHint(false);
    }
    else { const pts=score*ptsMap[difficulty]; const perfect=score===N; setFinished(true); if(user) awardPoints(user.uid,pts); onDone(pts,perfect); }
  }

  if (!started) return (
    <div className="min-h-screen flex items-center justify-center p-4 screen-enter" style={{ background:"#120A04" }}>
      <div className="max-w-lg w-full rounded-3xl border overflow-hidden" style={{ background:"#1A0C04", borderColor:"#3D1F0A" }}>
        <div className="h-2" style={{ background:`linear-gradient(90deg,${book.color},#D4A853)` }} />
        <div className="p-6 sm:p-8">
          <button onClick={onBack} className="text-sm mb-8" style={{ color:"#7A5C3E" }}>‹ Volver al libro</button>
          <p className="text-xs tracking-[0.25em] uppercase mb-2" style={{ color:"#D4A853" }}>Expediente · {experience.setting}</p>
          <h2 className="font-display text-3xl font-bold mb-2" style={{ color:"#F5ECD7" }}>{experience.role}</h2>
          <p className="text-sm leading-relaxed mb-6" style={{ color:"#7A5C3E" }}>{experience.mission}</p>
          <div className="rounded-2xl border p-4 mb-6" style={{ background:"#120A04", borderColor:"#2A1408" }}>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><p className="font-display font-bold" style={{ color:"#D4A853" }}>{N}</p><p className="text-xs" style={{ color:"#5C3518" }}>casos</p></div>
              <div><p className="font-display font-bold" style={{ color:"#D4A853" }}>{difficulty==="easy"?"Guiado":difficulty==="medium"?"Analítico":"Experto"}</p><p className="text-xs" style={{ color:"#5C3518" }}>modo</p></div>
              <div><p className="font-display font-bold" style={{ color:"#D4A853" }}>+{ptsMap[difficulty]}</p><p className="text-xs" style={{ color:"#5C3518" }}>por acierto</p></div>
            </div>
          </div>
          <button onClick={()=>setStarted(true)} className="w-full py-3.5 rounded-2xl font-bold" style={{ background:"#D4A853", color:"#120A04" }}>Abrir expediente</button>
        </div>
      </div>
    </div>
  );

  if (finished) return (
    <div className="min-h-screen flex items-center justify-center p-4 screen-enter" style={{ background:"#120A04" }}>
      <div className="text-center max-w-sm w-full">
        <div className="text-6xl mb-4">{score>=N*0.8?"🏆":score>=N*0.5?"⭐":"📖"}</div>
        <h2 className="font-display text-5xl font-bold mb-2" style={{ color:"#D4A853" }}>{score}/{N}</h2>
        <p className="mb-2" style={{ color:"#7A5C3E" }}>{score>=N*0.8?"¡Excelente análisis!":score>=N*0.5?"¡Buen trabajo!":"Sigue practicando"}</p>
        {score===N && difficulty==="hard" && (
          <p className="text-sm mb-1 flex items-center justify-center gap-1.5" style={{ color:book.color }}>
            🏅 ¡Medalla {(book.badgeIcon.startsWith?.("/")||book.badgeIcon.startsWith?.("data:")) ? <img src={book.badgeIcon} className="w-5 h-5 object-contain inline rounded" /> : book.badgeIcon} {book.badgeName} desbloqueada!
          </p>
        )}
        <p className="text-sm mb-6" style={{ color:"#5C3518" }}>+{score*ptsMap[difficulty]} puntos ganados</p>
        <button onClick={onBack} className="px-8 py-3 rounded-2xl font-bold transition-all hover:opacity-90" style={{ background:"#D4A853", color:"#120A04" }}>Volver al libro</button>
      </div>
    </div>
  );

  const correct = selected===q.correct
    || (isHL&&highlight===q.correctHighlight)
    || (q.mode==="reorder" && ordered.every((item,index) => item===(q.orderItems??[])[index]))
    || (q.mode==="match" && (q.matchPairs??[]).every(pair => matches[pair.left]===pair.right))
    || (q.mode==="noise" && noiseSelected.length===(q.noiseWords??[]).length && (q.noiseWords??[]).every(word=>noiseSelected.includes(word)));
  const modeLabels: Record<Question["mode"],string> = {
    critical:"Análisis crítico", fragment:"Lectura cercana", highlight:"Inspector de evidencia",
    reorder:"Orden argumentativo", match:"Match de posturas", fallacy:"Cartas de falacia", verdict:"Veredicto rápido",
    agenda:"La Agenda Oculta", stress:"Prueba de Estrés", noise:"Filtro de Ruido",
  };
  const fallacyDefinitions: Record<string,string> = {
    "Sesgo de nostalgia":"Idealiza el pasado y usa ese recuerdo selectivo como si fuera evidencia objetiva.",
    "Ad Hominem":"Ataca a la persona que sostiene una idea en lugar de responder a sus razones.",
    "Hombre de Paja":"Deforma una postura para refutar una versión más débil que nadie defendió.",
    "Falsa Equivalencia":"Presenta como iguales dos casos cuyas diferencias son relevantes.",
    "Causa falsa":"Afirma causalidad solo porque dos hechos coinciden o uno ocurre antes que el otro.",
  };
  return (
    <div className="min-h-screen pb-20 sm:pb-8 screen-enter" style={{ background:"#120A04" }}>
      <div className="max-w-xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="text-sm hover:opacity-70" style={{ color:"#7A5C3E" }}>‹ {book.title}</button>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-1 rounded-full" style={{ background:"rgba(217,119,6,0.12)", color:"#D97706" }}>🔥 {stats.streak}</span>
            <span className="text-xs px-2 py-1 rounded-full" style={{ background:"#2A1408", color:{"easy":"#5C8A3E","medium":"#D4A853","hard":"#C87941"}[difficulty] }}>{{easy:"🌱 Fácil",medium:"⚡ Medio",hard:"💀 Difícil"}[difficulty]}</span>
          </div>
        </div>
        {/* Progress */}
        <div className="mb-5">
          <div className="flex justify-between text-xs mb-1.5" style={{ color:"#5C3518" }}>
            <span>{current+1} / {N}</span><span>{score} ✓</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background:"#2A1408" }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width:`${pct}%`, background:"#D4A853" }} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs" style={{ color:"#5C3518" }}>#{q.concept}</span>
          <span className="text-xs px-2 py-1 rounded-full border" style={{ color:"#7A5C3E", borderColor:"#2A1408" }}>{modeLabels[q.mode]}</span>
        </div>
        {difficulty==="easy" && !answered && (
          <div className="mt-3">
            <button onClick={()=>setShowHint(v=>!v)} className="text-xs px-3 py-2 rounded-xl border font-semibold" style={{ background:showHint?"rgba(212,168,83,0.12)":"#1A0C04", borderColor:"#3D1F0A", color:"#D4A853" }}>Pista</button>
            {showHint && (
              <div className="mt-2 rounded-xl border p-3 screen-enter" style={{ background:"rgba(212,168,83,0.08)", borderColor:"#3D1F0A" }}>
                <p className="text-xs uppercase tracking-widest mb-1" style={{ color:"#D4A853" }}>Qué debes analizar</p>
                <p className="text-sm leading-relaxed" style={{ color:"#EDE0C4" }}>{questionHint(q)}</p>
              </div>
            )}
          </div>
        )}
        {difficulty!=="hard" && !answered && (
          <div className="mt-3">
            {!hintCard ? (
              <button onClick={() => setHintCard(book.flashcards[Math.floor(Math.random()*book.flashcards.length)])} className="text-xs px-3 py-2 rounded-xl border" style={{ background:"#1A0C04", borderColor:"#3D1F0A", color:"#D4A853" }}>
                Sacar una flashcard de apoyo
              </button>
            ) : (
              <div className="rounded-xl border p-3" style={{ background:"#1A0C04", borderColor:"#3D1F0A" }}>
                <p className="text-xs uppercase tracking-widest mb-1" style={{ color:"#5C3518" }}>Apunte aleatorio</p>
                <p className="text-sm font-semibold mb-1" style={{ color:"#D4A853" }}>{hintCard.front}</p>
                <p className="text-xs leading-relaxed" style={{ color:"#7A5C3E" }}>{hintCard.back}</p>
              </div>
            )}
          </div>
        )}
        {q.fragment && q.mode!=="noise" && (
          <blockquote className="rounded-2xl p-4 my-4 border-l-4 text-sm leading-relaxed italic" style={{ background:"#1A0C04", borderColor:"#3D1F0A", color:"#EDE0C4" }}>
            {isHL && !answered ? <HighlightableText text={q.fragment} onSelect={chooseHL} options={q.options} /> : q.fragment}
          </blockquote>
        )}
        <h2 className="font-display text-xl font-semibold my-4" style={{ color:"#F5ECD7" }}>{q.text}</h2>
        {q.mode==="reorder" && (
          <div className="space-y-3">
            <div className="rounded-2xl border p-3 min-h-28" style={{ background:"#1A0C04", borderColor:"#3D1F0A" }}>
              <p className="text-xs uppercase tracking-widest mb-2" style={{ color:"#5C3518" }}>Estructura construida</p>
              {ordered.length===0 ? <p className="text-sm" style={{ color:"#3D1F0A" }}>Selecciona los enunciados en el orden correcto.</p> :
                ordered.map((item,index) => (
                  <div key={item} className="flex gap-2 py-2 border-b last:border-b-0 text-sm" style={{ borderColor:"#2A1408", color:"#EDE0C4" }}>
                    <span className="font-bold" style={{ color:"#D4A853" }}>{index+1}</span><span>{item}</span>
                  </div>
                ))}
            </div>
            <div className="space-y-2">
              {shuffled(q.orderItems??[]).map(item => (
                <button key={item} disabled={answered||ordered.includes(item)} onClick={() => setOrdered(prev=>[...prev,item])} className="w-full text-left px-4 py-3 rounded-xl border text-sm disabled:opacity-30" style={{ background:"#1A0C04", borderColor:"#2A1408", color:"#F5ECD7" }}>{item}</button>
              ))}
            </div>
            {!answered && <div className="flex gap-2">
              <button onClick={() => setOrdered([])} className="px-4 py-2.5 rounded-xl border text-sm" style={{ borderColor:"#2A1408", color:"#7A5C3E" }}>Reiniciar</button>
              <button onClick={submitOrder} disabled={ordered.length!==(q.orderItems??[]).length} className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40" style={{ background:"#D4A853", color:"#120A04" }}>Comprobar estructura</button>
            </div>}
          </div>
        )}
        {q.mode==="match" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              {(q.matchPairs??[]).map(pair => (
                <button key={pair.left} onClick={()=>setActiveMatch(pair.left)} disabled={answered} className="w-full text-left p-3 rounded-xl border text-sm" style={{ background:activeMatch===pair.left?"rgba(212,168,83,0.14)":"#1A0C04", borderColor:matches[pair.left]?"#D4A853":"#2A1408", color:"#F5ECD7" }}>
                  <span className="block text-xs mb-1" style={{ color:"#5C3518" }}>Concepto</span>{pair.left}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {shuffled(q.matchPairs??[]).map(pair => {
                const used = Object.values(matches).includes(pair.right);
                return <button key={pair.right} onClick={()=>connectMatch(pair.right)} disabled={answered||!activeMatch} className="w-full text-left p-3 rounded-xl border text-xs leading-relaxed disabled:opacity-50" style={{ background:used?"rgba(92,138,62,0.12)":"#1A0C04", borderColor:used?"#5C8A3E":"#2A1408", color:"#EDE0C4" }}>{pair.right}</button>;
              })}
            </div>
            {!answered && <button onClick={submitMatches} disabled={Object.keys(matches).length!==(q.matchPairs??[]).length} className="col-span-2 py-3 rounded-xl text-sm font-bold disabled:opacity-40" style={{ background:"#D4A853", color:"#120A04" }}>Comprobar conexiones</button>}
          </div>
        )}
        {q.mode==="verdict" && (
          <div className="grid grid-cols-2 gap-3" onTouchStart={e=>setSwipeStart(e.touches[0].clientX)} onTouchEnd={e=>{
            if (swipeStart===null || answered) return;
            const distance=e.changedTouches[0].clientX-swipeStart;
            if (Math.abs(distance)>50) choose(distance<0?0:1);
            setSwipeStart(null);
          }}>
            {q.options.map((opt,i) => (
              <button key={opt} onClick={()=>choose(i)} disabled={answered} className="rounded-2xl border p-5 text-left transition-all" style={{ background:answered&&i===q.correct?"rgba(92,138,62,0.2)":answered&&i===selected?"rgba(139,26,26,0.2)":"#1A0C04", borderColor:answered&&i===q.correct?"#5C8A3E":answered&&i===selected?"#8B1A1A":"#2A1408", color:"#F5ECD7" }}>
                <span className="block text-2xl mb-3">{i===0?"←":"→"}</span>
                <span className="text-sm font-bold">{opt}</span>
              </button>
            ))}
            <p className="col-span-2 text-center text-xs" style={{ color:"#5C3518" }}>Izquierda: válido · Derecha: falacia o afirmación sin sustento</p>
          </div>
        )}
        {q.mode==="agenda" && (
          <div>
            <p className="text-xs uppercase tracking-widest mb-2" style={{ color:"#5C3518" }}>Perfiles de interés</p>
            <div className="grid gap-2">
              {q.options.map((opt,i)=>(
                <button key={opt} onClick={()=>choose(i)} disabled={answered} className="w-full rounded-2xl border p-4 text-left flex items-center gap-3 transition-all" style={{ background:answered&&i===q.correct?"rgba(16,185,129,0.14)":answered&&i===selected?"rgba(190,24,93,0.14)":"#1A0C04", borderColor:answered&&i===q.correct?"#10B981":answered&&i===selected?"#BE185D":"#2A1408", color:"#F5ECD7" }}>
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center font-display font-bold" style={{ background:"#2A1408", color:"#D4A853" }}>{i+1}</span>
                  <span className="text-sm font-semibold">{opt}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {q.mode==="stress" && (
          <div>
            <div className="rounded-2xl border p-4 mb-4 relative overflow-hidden" style={{ background:"rgba(15,23,42,0.72)", borderColor:answered?(correct?"#10B981":"#BE185D"):"#475569" }}>
              <div className="flex justify-between text-xs mb-2"><span style={{ color:"#94A3B8" }}>Tensión lógica</span><span className="font-bold" style={{ color:answered?(correct?"#10B981":"#BE185D"):"#D4A853" }}>{answered?(correct?"100%":"35%"):"0%"}</span></div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background:"#0F172A" }}><div className="h-full transition-all duration-500" style={{ width:answered?(correct?"100%":"35%"):"0%", background:correct?"#10B981":"#BE185D" }} /></div>
              {answered&&correct&&<div className="absolute inset-0 opacity-20" style={{ background:"repeating-linear-gradient(45deg,transparent,transparent 18px,#F5ECD7 19px,transparent 20px)" }} />}
            </div>
            <p className="text-xs uppercase tracking-widest mb-2" style={{ color:"#5C3518" }}>Hipótesis disponibles</p>
            <div className="space-y-2">
              {q.options.map((opt,i)=><button key={opt} onClick={()=>choose(i)} disabled={answered} className="w-full rounded-xl border p-3 text-left text-sm" style={{ background:answered&&i===q.correct?"rgba(16,185,129,0.12)":"#1A0C04", borderColor:answered&&i===q.correct?"#10B981":answered&&i===selected?"#BE185D":"#2A1408", color:"#EDE0C4" }}>{opt}</button>)}
            </div>
          </div>
        )}
        {q.mode==="noise" && q.fragment && (
          <div>
            <div className="rounded-2xl border p-5 leading-8 text-base mb-3" style={{ background:"#172033", borderColor:"#334155", color:"#F8FAFC" }}>
              {q.fragment.split(new RegExp(`(${(q.noiseWords??[]).join("|")})`,"g")).map((part,index)=>{
                const removable=(q.noiseWords??[]).includes(part);
                const crossed=noiseSelected.includes(part);
                return removable ? <button key={`${part}-${index}`} onClick={()=>!answered&&setNoiseSelected(prev=>prev.includes(part)?prev.filter(word=>word!==part):[...prev,part])} className="px-1 rounded transition-all" style={{ color:crossed?"#94A3B8":"#FBBF24", textDecoration:crossed?"line-through":"none", background:crossed?"rgba(148,163,184,0.12)":"rgba(217,119,6,0.14)" }}>{part}</button> : <span key={`${part}-${index}`}>{part}</span>;
              })}
            </div>
            <p className="text-xs mb-3" style={{ color:"#7A5C3E" }}>{noiseSelected.length} expresiones marcadas · toca de nuevo para restaurar</p>
            {!answered&&<button onClick={submitNoise} disabled={noiseSelected.length===0} className="w-full py-3 rounded-xl font-bold text-sm disabled:opacity-40" style={{ background:"#D4A853", color:"#120A04" }}>Aplicar filtro</button>}
          </div>
        )}
        {!isHL && !["reorder","match","verdict","agenda","stress","noise"].includes(q.mode) && (
          <div className="space-y-2.5">
            {q.options.map((opt,i) => {
              let bg="#1A0C04", border="#2A1408", color="#F5ECD7";
              if (answered) {
                if (i===q.correct){bg="rgba(92,138,62,0.2)";border="#5C8A3E";color="#9CCF6B";}
                else if (i===selected){bg="rgba(139,26,26,0.2)";border="#8B1A1A";color="#F08080";}
                else {color="#3D1F0A";}
              } else if (selected===i){border="#D4A853";}
              return (
                <button key={i} onClick={()=>choose(i)} disabled={answered} className={`w-full text-left px-4 py-3.5 border text-sm transition-all ${q.mode==="fallacy"?"rounded-xl":"rounded-2xl"}`} style={{ background:bg, borderColor:border, color }}>
                  <span className="font-mono mr-3 text-xs opacity-50">{String.fromCharCode(65+i)}</span>{opt}
                </button>
              );
            })}
          </div>
        )}
        {answered && q.mode==="fallacy" && selected!==null && (
          <div className="mt-3 rounded-2xl border p-4" style={{ background:"#1A0C04", borderColor:"#3D1F0A" }}>
            <p className="text-xs tracking-widest uppercase mb-1" style={{ color:"#D4A853" }}>Carta seleccionada · {q.options[selected]}</p>
            <p className="text-sm leading-relaxed" style={{ color:"#EDE0C4" }}>{fallacyDefinitions[q.options[selected]]}</p>
          </div>
        )}
        {answered && (
          <div className={`mt-4 rounded-2xl p-4 text-sm screen-enter ${q.mode==="stress"?"sticky bottom-4 z-20":""}`} style={{ background:correct?"rgba(16,185,129,0.16)":"rgba(190,24,93,0.18)", border:`1px solid ${correct?"#10B981":"#BE185D"}`, color:"#EDE0C4" }}>
            <p className="font-bold mb-1" style={{ color:correct?"#6EE7B7":"#FDA4AF" }}>{correct?"¡Evidencia detectada con éxito!":"Trampa lógica detectada"}</p>
            <p>{correct?q.feedback:selected!==null?`Elegiste «${q.options[selected]}». Esa opción era una trampa de distracción: ${q.feedbackAlt}`:q.feedbackAlt}</p>
          </div>
        )}
        {answered && (
          <button onClick={next} className="mt-4 w-full py-3.5 rounded-2xl font-bold transition-all hover:opacity-90" style={{ background:"#D4A853", color:"#120A04" }}>
            {current<N-1?"Siguiente →":"Ver resultados"}
          </button>
        )}
      </div>
    </div>
  );
}
function HighlightableText({ text, onSelect, options }: { text: string; onSelect: (s: string) => void; options: string[] }) {
  return (
    <div>
      <p className="not-italic leading-relaxed mb-4" style={{ color:"#EDE0C4" }}>{text}</p>
      <p className="text-xs mb-2 not-italic uppercase tracking-widest" style={{ color:"#7A5C3E" }}>Resalta la evidencia exacta</p>
      <div className="space-y-1.5">
        {options.map((opt,i) => (
          <button key={i} onClick={() => onSelect(opt)} className="block w-full text-left px-3 py-2 rounded-lg border text-sm transition-all hover:border-amber-700 not-italic" style={{ background:"#120A04", borderColor:"#3D1F0A", color:"#EDE0C4" }}>
            <span className="mr-2" style={{ color:"#D4A853" }}>▰</span>{opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── FlashcardScreen ───────────────────────────────────────────────────────────
function FlashcardScreen({ book, onBack }: { book: Book; onBack: () => void }) {
  const storageKey = `analisis-flashcards-${book.id}`;
  const [idx, setIdx] = useState(0); const [flipped, setFlipped] = useState(false);
  const [creating, setCreating] = useState(false);
  const [front, setFront] = useState(""); const [back, setBack] = useState("");
  const [customCards, setCustomCards] = useState<Flashcard[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey)??"[]") as Flashcard[]; } catch { return []; }
  });
  const generalCards: Flashcard[] = [
    { id:"general-author", front:"Autor y publicación", back:`${book.author} · ${book.year}` },
    { id:"general-genre", front:"Género", back:book.genre },
    { id:"general-key", front:"Clave de lectura", back:book.tagline },
  ];
  const cards = [...generalCards, ...book.flashcards, ...customCards]; const card = cards[idx];
  function createCard() {
    if (!front.trim() || !back.trim()) return;
    const next = [...customCards, { id:`custom-${Date.now()}`, front:front.trim(), back:back.trim() }];
    setCustomCards(next); localStorage.setItem(storageKey, JSON.stringify(next));
    setFront(""); setBack(""); setCreating(false); setIdx(cards.length); setFlipped(false);
  }
  return (
    <div className="min-h-screen pb-20 sm:pb-8 screen-enter" style={{ background:"#120A04" }}>
      <div className="max-w-lg mx-auto px-4 py-6">
        <button onClick={onBack} className="text-sm mb-5 hover:opacity-70 block" style={{ color:"#7A5C3E" }}>‹ {book.title}</button>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-xl font-semibold" style={{ color:"#F5ECD7" }}>Flashcards</h2>
            <p className="text-xs mt-1" style={{ color:"#5C3518" }}>Datos generales, conceptos y apuntes personales</p>
          </div>
          <button onClick={() => setCreating(v=>!v)} className="px-3 py-2 rounded-xl text-xs font-bold border" style={{ background:creating?"#2A1408":"#D4A853", borderColor:"#3D1F0A", color:creating?"#D4A853":"#120A04" }}>{creating?"Cancelar":"+ Crear"}</button>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[["Generales",generalCards.length],["Del libro",book.flashcards.length],["Creadas",customCards.length]].map(([label,value]) => (
            <div key={label} className="rounded-xl border p-3 text-center" style={{ background:"#1A0C04", borderColor:"#2A1408" }}>
              <div className="font-display text-lg font-bold" style={{ color:"#D4A853" }}>{value}</div>
              <div className="text-xs" style={{ color:"#5C3518" }}>{label}</div>
            </div>
          ))}
        </div>
        {creating ? (
          <div className="rounded-2xl border p-4" style={{ background:"#1A0C04", borderColor:"#3D1F0A" }}>
            <p className="font-semibold text-sm mb-1" style={{ color:"#F5ECD7" }}>Nueva tarjeta de estudio</p>
            <p className="text-xs mb-4" style={{ color:"#5C3518" }}>Formula una pregunta precisa y una respuesta breve.</p>
            <label className="text-xs block mb-1.5" style={{ color:"#7A5C3E" }}>Frente / pregunta</label>
            <input value={front} onChange={e=>setFront(e.target.value)} placeholder="Ej. ¿Qué representa el conflicto central?" className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none mb-3" style={{ background:"#120A04", borderColor:"#3D1F0A", color:"#F5ECD7" }} />
            <label className="text-xs block mb-1.5" style={{ color:"#7A5C3E" }}>Reverso / respuesta</label>
            <textarea value={back} onChange={e=>setBack(e.target.value)} rows={4} placeholder="Escribe tu explicación…" className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none resize-none" style={{ background:"#120A04", borderColor:"#3D1F0A", color:"#F5ECD7" }} />
            <button onClick={createCard} disabled={!front.trim()||!back.trim()} className="w-full mt-3 py-3 rounded-xl text-sm font-bold disabled:opacity-40" style={{ background:"#D4A853", color:"#120A04" }}>Guardar flashcard</button>
          </div>
        ) : (
          <>
            <div onClick={() => setFlipped(f=>!f)} className="cursor-pointer rounded-3xl border p-8 min-h-56 flex flex-col items-center justify-center text-center transition-all select-none" style={{ background:flipped?"#2A1408":"#1E0E04", borderColor:flipped?"#5C3518":"#2A1408" }}>
              <div className="flex items-center gap-2 mb-4">
                <p className="text-xs tracking-widest uppercase" style={{ color:"#5C3518" }}>{flipped?"Respuesta":"Pregunta"}</p>
                {card.id.startsWith("custom-") && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background:"rgba(212,168,83,0.12)", color:"#D4A853" }}>Tuya</span>}
              </div>
              <p className="font-display text-lg leading-relaxed" style={{ color:flipped?"#D4A853":"#F5ECD7" }}>{flipped?card.back:card.front}</p>
              <p className="text-xs mt-4" style={{ color:"#3D1F0A" }}>Toca para {flipped?"ver la pregunta":"ver la respuesta"}</p>
            </div>
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs" style={{ color:"#5C3518" }}>Tarjeta {idx+1} de {cards.length}</span>
              <span className="text-xs" style={{ color:"#3D1F0A" }}>{idx<generalCards.length?"Información general":idx<generalCards.length+book.flashcards.length?"Colección de la obra":"Colección personal"}</span>
            </div>
        <div className="flex items-center justify-center gap-4 mt-5">
          <button onClick={() => { setIdx(i=>Math.max(0,i-1)); setFlipped(false); }} disabled={idx===0} className="px-5 py-2.5 rounded-xl border text-sm disabled:opacity-30" style={{ background:"#1A0C04", borderColor:"#2A1408", color:"#7A5C3E" }}>← Anterior</button>
          <div className="flex gap-1.5">
            {cards.map((_,i) => (
              <button key={i} onClick={() => { setIdx(i); setFlipped(false); }} className="w-2 h-2 rounded-full transition-all" style={{ background:i===idx?"#D4A853":"#3D1F0A" }} />
            ))}
          </div>
          <button onClick={() => { setIdx(i=>Math.min(cards.length-1,i+1)); setFlipped(false); }} disabled={idx===cards.length-1} className="px-5 py-2.5 rounded-xl border text-sm disabled:opacity-30" style={{ background:"#1A0C04", borderColor:"#2A1408", color:"#7A5C3E" }}>Siguiente →</button>
        </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── DebateScreen ──────────────────────────────────────────────────────────────
function DebateScreen({ book, user, onLoginNeeded, onBack }: { book: Book; user: User|null; onLoginNeeded: () => void; onBack: () => void }) {
  const [posts, setPosts] = useState<DebatePost[]>([]); const [text, setText] = useState(""); const [loading, setLoading] = useState(true);
  const prompt = book.debatePrompts[0];
  const colId = `debates-${prompt.id}`;

  const fetch = useCallback(async () => {
    const q = query(collection(db, colId), orderBy("ts","desc"));
    const snap = await getDocs(q);
    setPosts(snap.docs.map(d => { const data = d.data() as Omit<DebatePost,"id"|"likes"|"likedBy">; return { likes:0, likedBy:[] as string[], ...data, id:d.id }; }));
    setLoading(false);
  }, [colId]);
  useEffect(() => { fetch(); }, [fetch]);

  async function post() {
    if (!user) { onLoginNeeded(); return; }
    if (!text.trim()) return;
    await addDoc(collection(db, colId), { user:user.email?.split("@")[0]??"Anónimo", authorId:user.uid, text:text.trim(), ts:Date.now(), likes:0, likedBy:[] });
    setText(""); fetch();
    awardPoints(user.uid, 5);
    try { await updateDoc(doc(db,"users",user.uid),{ totalDebates:increment(1) }); } catch {}
  }
  async function toggleLike(p: DebatePost) {
    if (!user) { onLoginNeeded(); return; }
    const ref = doc(db, colId, p.id);
    const liked = p.likedBy.includes(user.uid);
    await updateDoc(ref, liked ? { likes:increment(-1), likedBy:arrayRemove(user.uid) } : { likes:increment(1), likedBy:arrayUnion(user.uid) });
    if (!liked && p.authorId) {
      const authorRef = doc(db,"users",p.authorId);
      const authorSnap = await getDoc(authorRef);
      const previous = (authorSnap.data()?.bestDebateResponse?.likes as number|undefined)??-1;
      if (p.likes+1 > previous) {
        await setDoc(authorRef,{ bestDebateResponse:{ text:p.text, likes:p.likes+1, bookTitle:book.title } },{ merge:true });
      }
    }
    fetch();
  }

  const sorted = [...posts].sort((a,b)=>b.likes-a.likes);

  return (
    <div className="min-h-screen pb-20 sm:pb-8 screen-enter" style={{ background:"#120A04" }}>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button onClick={onBack} className="text-sm mb-5 hover:opacity-70 block" style={{ color:"#7A5C3E" }}>‹ {book.title}</button>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">⚖️</span>
          <div>
            <h2 className="font-display text-2xl font-bold" style={{ color:"#F5ECD7" }}>Debate</h2>
            <p className="text-xs" style={{ color:"#5C3518" }}>Los argumentos con más likes suben al top</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            ["Voces", posts.length],
            ["Apoyos", posts.reduce((total,p)=>total+p.likes,0)],
            ["Recompensa", "+5 pts"],
          ].map(([label,value]) => (
            <div key={label} className="rounded-xl border px-3 py-2.5 text-center" style={{ background:"#1A0C04", borderColor:"#2A1408" }}>
              <div className="font-display font-bold" style={{ color:"#D4A853" }}>{value}</div>
              <div className="text-xs" style={{ color:"#5C3518" }}>{label}</div>
            </div>
          ))}
        </div>
        {/* Prompt card */}
        <div className="rounded-2xl border p-5 mb-5" style={{ background:`linear-gradient(135deg,${book.color}18,#1E0E04)`, borderColor:book.color+"44" }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-0.5 h-7 rounded-full" style={{ background:book.color }} />
            <span className="text-xs tracking-widest uppercase" style={{ color:"#5C3518" }}>Pregunta de debate</span>
          </div>
          <h3 className="font-display text-lg font-bold mb-2" style={{ color:"#F5ECD7" }}>{prompt.question}</h3>
          <p className="text-sm leading-relaxed" style={{ color:"#7A5C3E" }}>{prompt.context}</p>
          <p className="text-xs mt-3" style={{ color:"#5C3518" }}>💬 +5 puntos · ❤️ Los likes determinan el top</p>
        </div>
        <div className="rounded-2xl border p-4 mb-5" style={{ background:"#160B05", borderColor:"#2A1408" }}>
          <p className="text-xs tracking-widest uppercase mb-2" style={{ color:"#D4A853" }}>Antes de publicar</p>
          <div className="grid sm:grid-cols-3 gap-2 text-xs leading-relaxed" style={{ color:"#7A5C3E" }}>
            <p><strong style={{ color:"#EDE0C4" }}>Tesis.</strong> Toma una postura inequívoca.</p>
            <p><strong style={{ color:"#EDE0C4" }}>Evidencia.</strong> Cita una escena o decisión.</p>
            <p><strong style={{ color:"#EDE0C4" }}>Matiz.</strong> Anticipa una objeción razonable.</p>
          </div>
        </div>
        {/* Input */}
        <div className="rounded-2xl border p-4 mb-5" style={{ background:"#1A0C04", borderColor:"#2A1408" }}>
          <textarea value={text} onChange={e=>setText(e.target.value)} rows={3} placeholder={user?"Desarrolla tu argumento con evidencia del texto…":"Inicia sesión para participar en el debate"} readOnly={!user} className="w-full rounded-xl px-3 py-2.5 text-sm resize-none outline-none border transition-colors" style={{ background:"#120A04", borderColor:"#2A1408", color:"#F5ECD7" }} onClick={!user?onLoginNeeded:undefined} onFocus={e=>(e.target.style.borderColor="#D4A853")} onBlur={e=>(e.target.style.borderColor="#2A1408")} />
          <div className="flex items-center justify-between mt-2.5">
            <span className="text-xs" style={{ color:"#3D1F0A" }}>{text.length}/500</span>
            <button onClick={post} disabled={!text.trim()} className="px-5 py-2 rounded-xl text-sm font-bold disabled:opacity-40 transition-all hover:opacity-90" style={{ background:"#D4A853", color:"#120A04" }}>Publicar</button>
          </div>
        </div>
        {/* Posts sorted by likes */}
        <div className="space-y-3">
          <h4 className="text-xs tracking-widest uppercase" style={{ color:"#5C3518" }}>
            {posts.length} argumento{posts.length!==1?"s":""} · ordenados por relevancia
          </h4>
          {loading ? <p className="text-sm" style={{ color:"#3D1F0A" }}>Cargando…</p> :
            sorted.length===0 ? (
              <div className="text-center py-12 rounded-2xl border" style={{ borderColor:"#2A1408" }}>
                <p className="text-3xl mb-2">⚖️</p>
                <p className="text-sm" style={{ color:"#5C3518" }}>Sé el primero en argumentar</p>
              </div>
            ) : sorted.map((p,i) => {
              const isLiked = user && p.likedBy.includes(user.uid);
              return (
                <div key={p.id} className="rounded-2xl border overflow-hidden" style={{ background:"#1A0C04", borderColor: i===0&&p.likes>0?"#D4A853":"#2A1408" }}>
                  {i===0&&p.likes>0&&<div className="px-4 py-1.5 text-xs font-bold flex items-center gap-1" style={{ background:"rgba(212,168,83,0.12)", color:"#D4A853" }}>🏆 Argumento más votado</div>}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background:"#2A1408", color:"#D4A853" }}>{p.user[0]?.toUpperCase()}</div>
                        <span className="text-sm font-medium" style={{ color:"#D4A853" }}>{p.user}</span>
                      </div>
                      <span className="text-xs" style={{ color:"#3D1F0A" }}>{new Date(p.ts).toLocaleDateString("es",{day:"2-digit",month:"short"})}</span>
                    </div>
                    <p className="text-sm leading-relaxed mb-3" style={{ color:"#EDE0C4" }}>{p.text}</p>
                    <div className="flex items-center gap-3">
                      <button onClick={() => toggleLike(p)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all" style={{ background:isLiked?"rgba(212,168,83,0.2)":"#2A1408", color:isLiked?"#D4A853":"#5C3518", border:`1px solid ${isLiked?"#D4A853":"transparent"}` }}>
                        ❤️ {p.likes > 0 ? p.likes : ""} Me gusta
                      </button>
                      <span className="text-xs" style={{ color:"#3D1F0A" }}>{p.likes} interacciones</span>
                    </div>
                  </div>
                </div>
              );
            })
          }
        </div>
      </div>
    </div>
  );
}

// ── ForumScreen (Reddit-style) ────────────────────────────────────────────────
function ForumScreen({ book, user, onLoginNeeded, onBack }: { book: Book; user: User|null; onLoginNeeded: () => void; onBack: () => void }) {
  const [posts, setPosts] = useState<ForumPost[]>([]); const [text, setText] = useState(""); const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState<string|null>(null); const [replyText, setReplyText] = useState("");

  const fetch = useCallback(async () => {
    const q = query(collection(db, book.forumId), orderBy("ts","asc"));
    const snap = await getDocs(q);
    const flat: ForumPost[] = snap.docs.map(d => { const data = d.data() as Omit<ForumPost,"id"|"upvotes"|"upvotedBy">; return { upvotes:0, upvotedBy:[] as string[], ...data, id:d.id }; });
    // nest replies
    const roots: ForumPost[] = [];
    const map: Record<string,ForumPost> = {};
    flat.forEach(p => { map[p.id] = { ...p, replies:[] }; });
    flat.forEach(p => {
      if (p.parentId && map[p.parentId]) { map[p.parentId].replies!.push(map[p.id]); }
      else { roots.push(map[p.id]); }
    });
    setPosts(roots.reverse());
    setLoading(false);
  }, [book.forumId]);
  useEffect(() => { fetch(); }, [fetch]);

  async function post(parentId?: string, t?: string) {
    if (!user) { onLoginNeeded(); return; }
    const body = t ?? text;
    if (!body.trim()) return;
    const data: Record<string,unknown> = { user:user.email?.split("@")[0]??"Anónimo", text:body.trim(), ts:Date.now(), upvotes:0, upvotedBy:[] };
    if (parentId) data.parentId = parentId;
    await addDoc(collection(db, book.forumId), data);
    if (!parentId) setText(""); else { setReplyTo(null); setReplyText(""); }
    fetch();
    awardPoints(user.uid, 3);
    try { await updateDoc(doc(db,"users",user.uid),{ totalForumPosts:increment(1) }); } catch {}
  }
  async function toggleUpvote(p: ForumPost) {
    if (!user) { onLoginNeeded(); return; }
    const ref = doc(db, book.forumId, p.id);
    const voted = p.upvotedBy.includes(user.uid);
    await updateDoc(ref, voted ? { upvotes:increment(-1), upvotedBy:arrayRemove(user.uid) } : { upvotes:increment(1), upvotedBy:arrayUnion(user.uid) });
    fetch();
  }

  return (
    <div className="min-h-screen pb-20 sm:pb-8 screen-enter" style={{ background:"#120A04" }}>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button onClick={onBack} className="text-sm mb-4 hover:opacity-70 block" style={{ color:"#7A5C3E" }}>‹ {book.title}</button>
        {/* Reddit-style header */}
        <div className="rounded-2xl border overflow-hidden mb-4" style={{ background:"#1A0C04", borderColor:"#2A1408" }}>
          <div className="h-16" style={{ background:`linear-gradient(120deg,${book.color}66,${book.spine}22,#1A0C04)` }} />
          <div className="px-4 pb-4 -mt-5 flex items-end gap-3">
            <div className="w-12 h-12 rounded-xl border-4 flex items-center justify-center text-lg" style={{ background:book.color, borderColor:"#1A0C04" }}>{book.badgeIcon}</div>
            <div className="flex-1 pb-0.5">
              <h2 className="font-bold text-base" style={{ color:"#F5ECD7" }}>r/{book.id}</h2>
              <p className="text-xs" style={{ color:"#5C3518" }}>Comunidad de lectura · {posts.length} conversaciones</p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full border" style={{ color:"#D4A853", borderColor:"#3D1F0A" }}>Abierto</span>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto mb-4 pb-1">
          {["Nuevos","Más votados","Análisis","Preguntas"].map((filter,index) => (
            <span key={filter} className="whitespace-nowrap text-xs px-3 py-1.5 rounded-full border" style={{ background:index===0?"#2A1408":"transparent", borderColor:"#2A1408", color:index===0?"#D4A853":"#5C3518" }}>{filter}</span>
          ))}
        </div>
        {/* Post input */}
        <div className="rounded-2xl border p-3 mb-5" style={{ background:"#1A0C04", borderColor:"#2A1408" }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background:"#2A1408", color:"#D4A853" }}>{user?user.email?.[0]?.toUpperCase():"?"}</div>
            <textarea value={text} onChange={e=>setText(e.target.value)} rows={2} placeholder={user?"¿Qué pregunta tienes sobre el libro?":"Inicia sesión para preguntar"} readOnly={!user} className="flex-1 text-sm resize-none outline-none rounded-xl px-3 py-2 border" style={{ background:"#120A04", borderColor:"#2A1408", color:"#F5ECD7" }} onClick={!user?onLoginNeeded:undefined} onFocus={e=>(e.target.style.borderColor="#D4A853")} onBlur={e=>(e.target.style.borderColor="#2A1408")} />
          </div>
          <div className="flex justify-end">
            <button onClick={() => post()} disabled={!text.trim()} className="px-4 py-1.5 rounded-full text-xs font-bold disabled:opacity-40 transition-all hover:opacity-90" style={{ background:"#D4A853", color:"#120A04" }}>Publicar</button>
          </div>
        </div>
        {/* Posts */}
        {loading ? <p className="text-sm" style={{ color:"#3D1F0A" }}>Cargando…</p> :
          posts.length===0 ? (
            <div className="text-center py-12 rounded-2xl border" style={{ borderColor:"#2A1408" }}>
              <p className="text-3xl mb-2">💬</p>
              <p className="text-sm" style={{ color:"#5C3518" }}>Sé el primero en preguntar en r/{book.id}</p>
            </div>
          ) : posts.map(p => (
            <RedditPost key={p.id} post={p} user={user} depth={0}
              onUpvote={toggleUpvote} onReply={setReplyTo}
              replyTo={replyTo} replyText={replyText} setReplyText={setReplyText}
              onSubmitReply={(pid) => post(pid, replyText)} onLoginNeeded={onLoginNeeded} />
          ))
        }
      </div>
    </div>
  );
}

function RedditPost({ post, user, depth, onUpvote, onReply, replyTo, replyText, setReplyText, onSubmitReply, onLoginNeeded }: {
  post: ForumPost; user: User|null; depth: number;
  onUpvote: (p: ForumPost) => void; onReply: (id: string|null) => void;
  replyTo: string|null; replyText: string; setReplyText: (s: string) => void;
  onSubmitReply: (pid: string) => void; onLoginNeeded: () => void;
}) {
  const voted = user && post.upvotedBy.includes(user.uid);
  const threadColors = ["#D4A853","#5C8A3E","#1A6A8A","#7A3A9A","#A0390E"];
  const lineColor = threadColors[depth % threadColors.length];
  const indentPx = depth * 20;

  return (
    <div style={{ marginLeft:indentPx>0?`${indentPx}px`:undefined }}>
      {depth>0 && <div className="absolute" style={{ left:`${indentPx-12}px`, top:0, bottom:0, width:2, background:lineColor+"44", borderRadius:2 }} />}
      <div className="relative mb-2">
        {depth>0 && <div className="absolute" style={{ left:-12, top:14, width:12, height:2, background:lineColor+"44" }} />}
        <div className="rounded-xl border p-3" style={{ background:depth===0?"#1A0C04":"#160A02", borderColor:depth===0?"#2A1408":"#1A0808" }}>
          {/* Header */}
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background:"#2A1408", color:lineColor }}>{post.user[0]?.toUpperCase()}</div>
            <span className="text-xs font-bold" style={{ color:lineColor }}>{post.user}</span>
            <span className="text-xs" style={{ color:"#2A1408" }}>·</span>
            <span className="text-xs" style={{ color:"#2A1408" }}>{new Date(post.ts).toLocaleDateString("es",{day:"2-digit",month:"short",year:"2-digit"})}</span>
          </div>
          {/* Body */}
          <p className="text-sm leading-relaxed mb-2" style={{ color:"#EDE0C4" }}>{post.text}</p>
          {/* Actions — Reddit row */}
          <div className="flex items-center gap-1">
            {/* Upvote */}
            <button onClick={() => onUpvote(post)} className="flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-all" style={{ background:voted?"rgba(212,168,83,0.15)":"transparent", color:voted?"#D4A853":"#3D1F0A" }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 2L10 7H2L6 2Z"/></svg>
              <span className="font-bold">{post.upvotes||0}</span>
            </button>
            <button onClick={() => onUpvote(post)} className="flex items-center px-1.5 py-1 rounded-full text-xs transition-all" style={{ color:"#2A1408" }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 10L2 5H10L6 10Z"/></svg>
            </button>
            {/* Reply */}
            <button onClick={() => { if(!user){onLoginNeeded();return;} onReply(replyTo===post.id?null:post.id); }} className="flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-all hover:bg-white/5" style={{ color:"#3D1F0A" }}>
              💬 Responder
            </button>
          </div>
          {/* Reply input */}
          {replyTo===post.id && (
            <div className="mt-2 border-t pt-2" style={{ borderColor:"#2A1408" }}>
              <div className="flex gap-2">
                <textarea value={replyText} onChange={e=>setReplyText(e.target.value)} rows={2} placeholder="Escribe tu respuesta…" className="flex-1 text-sm resize-none outline-none rounded-lg px-2.5 py-1.5 border" style={{ background:"#120A04", borderColor:"#3D1F0A", color:"#F5ECD7" }} />
                <div className="flex flex-col gap-1">
                  <button onClick={() => onSubmitReply(post.id)} disabled={!replyText.trim()} className="px-3 py-1 rounded-lg text-xs font-bold disabled:opacity-40" style={{ background:"#D4A853", color:"#120A04" }}>Enviar</button>
                  <button onClick={() => onReply(null)} className="px-3 py-1 rounded-lg text-xs" style={{ color:"#5C3518" }}>Cancelar</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Nested replies */}
      {(post.replies??[]).length>0 && (
        <div className="relative">
          {(post.replies??[]).map(r => (
            <RedditPost key={r.id} post={r} user={user} depth={depth+1}
              onUpvote={onUpvote} onReply={onReply}
              replyTo={replyTo} replyText={replyText} setReplyText={setReplyText}
              onSubmitReply={onSubmitReply} onLoginNeeded={onLoginNeeded} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────
type Screen = "home"|"book"|"quiz-difficulty"|"quiz"|"flashcards"|"debate"|"forum"|"manual"|"profile";

export default function App() {
  const [user, setUser] = useState<User|null>(null);
  const [stats, setStats] = useState<Stats>(DEFAULT_STATS);
  const [authReady, setAuthReady] = useState(false);
  const [tab, setTab] = useState<Tab>("library");
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedBook, setSelectedBook] = useState<Book|null>(null);
  const [quizDifficulty, setQuizDifficulty] = useState<Difficulty>("easy");
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthReady(true);
      if (u) {
        const s = await loadStats(u.uid);
        setStats(s);
        const today = new Date().toDateString();
        if (s.lastActive !== today) {
          const wasYesterday = s.lastActive === new Date(Date.now()-86400000).toDateString();
          const newStreak = wasYesterday ? s.streak+1 : 1;
          await setDoc(doc(db,"users",u.uid),{ lastActive:today, streak:newStreak },{ merge:true });
          setStats(prev => ({ ...prev, lastActive:today, streak:newStreak }));
        }
      }
    });
  }, []);

  function refreshStats() { if (user) loadStats(user.uid).then(setStats); }

  async function handleLogin(u: User) {
    setUser(u); setShowLogin(false);
    const s = await loadStats(u.uid);
    setStats(s);
    await setDoc(doc(db,"users",u.uid),{ lastActive:new Date().toDateString() },{ merge:true });
  }
  async function handleLogout() {
    await signOut(auth); setUser(null); setStats(DEFAULT_STATS);
    setScreen("home"); setTab("library");
  }

  function handleBookMode(mode: "quiz"|"flashcards"|"debate"|"forum") {
    if (mode==="quiz") { setScreen("quiz-difficulty"); }
    else if (mode==="flashcards") { setScreen("flashcards"); }
    else if (mode==="debate") { setScreen("debate"); }
    else { setScreen("forum"); }
  }

  async function handleQuizDone(_pts: number, perfect: boolean) {
    if (!user || !selectedBook) return;
    const levelKey = `${selectedBook.id}:${quizDifficulty}`;
    const update: Record<string,unknown> = {
      completedBooks:arrayUnion(selectedBook.id),
      completedLevels:arrayUnion(levelKey),
      totalQuizzes:increment(1),
    };
    if (perfect && quizDifficulty==="hard") update.completedBooksHard = arrayUnion(selectedBook.id);
    await updateDoc(doc(db,"users",user.uid),update);
    setStats(prev=>({
      ...prev,
      completedBooks:[...new Set([...(prev.completedBooks??[]),selectedBook.id])],
      completedLevels:[...new Set([...(prev.completedLevels??[]),levelKey])],
      completedBooksHard:perfect&&quizDifficulty==="hard"
        ? [...new Set([...(prev.completedBooksHard??[]),selectedBook.id])]
        : prev.completedBooksHard,
      totalQuizzes:(prev.totalQuizzes??0)+1,
    }));
  }

  function handleTabChange(t: Tab) {
    setTab(t);
    if (t==="library") setScreen("home");
    else if (t==="manual") setScreen("manual");
    else setScreen("profile");
  }

  if (!authReady) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background:"#120A04" }}>
      <div className="text-center">
        <div className="font-display text-4xl font-bold mb-2" style={{ color:"#D4A853" }}>Análisis</div>
        <div className="text-xs animate-pulse" style={{ color:"#3D1F0A" }}>Cargando…</div>
      </div>
    </div>
  );

  const inSubScreen = ["book","quiz-difficulty","quiz","flashcards","debate","forum"].includes(screen);

  return (
    <div className="min-h-screen" style={{ background:"#120A04" }}>
      {/* Desktop nav (hidden on sub-screens in mobile for clean look) */}
      {!inSubScreen && (
        <DesktopNav tab={tab} onChange={handleTabChange} user={user} onLoginClick={() => setShowLogin(true)} onLogout={handleLogout} />
      )}
      {inSubScreen && (
        <div className="hidden sm:block">
          <DesktopNav tab={tab} onChange={handleTabChange} user={user} onLoginClick={() => setShowLogin(true)} onLogout={handleLogout} />
        </div>
      )}

      {/* Main content */}
      {screen==="home" && <HomeScreen user={user} stats={stats} onBook={b => { setSelectedBook(b); setScreen("book"); setTab("library"); }} />}
      {screen==="manual" && <ManualScreen />}
      {screen==="profile" && <ProfileScreen user={user} stats={stats} onLoginClick={() => setShowLogin(true)} onLogout={handleLogout} />}
      {screen==="book" && selectedBook && <BookDetailScreen book={selectedBook} stats={stats} onMode={handleBookMode} onBack={() => { setScreen("home"); setTab("library"); }} />}
      {screen==="quiz-difficulty" && selectedBook && <QuizDifficultyScreen book={selectedBook} onSelect={d => { setQuizDifficulty(d); setScreen("quiz"); }} onBack={() => setScreen("book")} />}
      {screen==="quiz" && selectedBook && <QuizScreen book={selectedBook} user={user} stats={stats} difficulty={quizDifficulty} onDone={handleQuizDone} onBack={() => setScreen("book")} />}
      {screen==="flashcards" && selectedBook && <FlashcardScreen book={selectedBook} onBack={() => setScreen("book")} />}
      {screen==="debate" && selectedBook && <DebateScreen book={selectedBook} user={user} onLoginNeeded={() => setShowLogin(true)} onBack={() => setScreen("book")} />}
      {screen==="forum" && selectedBook && <ForumScreen book={selectedBook} user={user} onLoginNeeded={() => setShowLogin(true)} onBack={() => setScreen("book")} />}

      {/* Bottom nav (mobile only, not on sub-screens) */}
      {!inSubScreen && <BottomNav tab={tab} onChange={handleTabChange} user={user} />}

      {/* Login modal */}
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} onLogin={handleLogin} />}
    </div>
  );
}
