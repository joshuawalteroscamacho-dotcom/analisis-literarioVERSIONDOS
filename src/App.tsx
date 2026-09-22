import { useState, useEffect, useCallback, useRef } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, User
} from "firebase/auth";
import {
  getFirestore, collection, addDoc, getDocs, query, orderBy,
  serverTimestamp, doc, setDoc, getDoc, increment, updateDoc, arrayUnion, arrayRemove
} from "firebase/firestore";
import badgeGranja from "@/assets/commies.jpg";
import badge1984   from "@/assets/bigbrother.jpg";
import badgeCafe   from "@/assets/cafe.png";

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
  difficulty: Difficulty; mode: "critical" | "fragment" | "highlight";
  concept: string; text: string; options: string[]; correct: number;
  feedback: string; feedbackAlt: string; fragment?: string; correctHighlight?: string;
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
}
interface ForumPost {
  id: string; user: string; text: string; ts: number;
  upvotes: number; upvotedBy: string[]; parentId?: string;
  replies?: ForumPost[];
}
interface DebatePost {
  id: string; user: string; text: string; ts: number;
  likes: number; likedBy: string[];
}

const DEFAULT_STATS: Stats = {
  points: 0, streak: 0, completedBooks: [], completedBooksHard: [],
  lastActive: "", totalQuizzes: 0, totalDebates: 0, totalForumPosts: 0
};

function selectQuestions(pool: Question[], n: number, diff?: Difficulty): (Question & { _idx: number })[] {
  const filtered = pool.map((q, i) => ({ ...q, _idx: i })).filter(q => !diff || q.difficulty === diff);
  const src = filtered.length >= n ? filtered : pool.map((q, i) => ({ ...q, _idx: i }));
  return [...src].sort(() => Math.random() - 0.5).slice(0, n);
}

// ── Books ─────────────────────────────────────────────────────────────────────
const BOOKS: Book[] = [
  {
    id:"1984", title:"1984", author:"George Orwell", year:1949,
    genre:"Distopía política", tagline:"El Gran Hermano te observa.",
    color:"#8B1A1A", spine:"#6B1212", badgeIcon: badge1984, badgeName:"Vigilante",
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
    color:"#2D5A1B", spine:"#1E3D12", badgeIcon: badgeGranja, badgeName:"Camarada",
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
    color:"#C87941", spine:"#9B5E30", badgeIcon: badgeCafe, badgeName:"Cocinera",
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
type Tab = "library" | "profile";
function BottomNav({ tab, onChange, user }: { tab: Tab; onChange: (t: Tab) => void; user: User|null }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t flex sm:hidden" style={{ background:"rgba(18,10,4,0.98)", backdropFilter:"blur(12px)", borderColor:"#2A1408" }}>
      {([["library","📚","Biblioteca"],["profile","👤","Perfil"]] as [Tab,string,string][]).map(([t,icon,label]) => (
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
            {([["library","📚 Biblioteca"],["profile","👤 Perfil"]] as [Tab,string][]).map(([t,label]) => (
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

// ── ProfileScreen ─────────────────────────────────────────────────────────────
function ProfileScreen({ user, stats, onLoginClick, onLogout }: { user: User|null; stats: Stats; onLoginClick: () => void; onLogout: () => void }) {
  const earned = stats.completedBooksHard ?? [];
  const allBadges = BOOKS.map(b => ({
    book: b,
    earned: earned.includes(b.id),
  }));

  const statItems = [
    { label:"Racha actual", value:`${stats.streak} días`, icon:"🔥" },
    { label:"Puntos totales", value:`${stats.points}`, icon:"⭐" },
    { label:"Libros completados", value:`${(stats.completedBooks??[]).length}`, icon:"📖" },
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

        {/* Section header */}
        <h3 className="font-display text-xl font-semibold mb-4" style={{ color:"#F5ECD7" }}>
          Biblioteca · <span style={{ color:"#D4A853" }}>{BOOKS.length} obras</span>
        </h3>

        {/* Bookshelf */}
        {[0,1,2].map(row => {
          const rowBooks = BOOKS.slice(row*4, row*4+4);
          if (!rowBooks.length) return null;
          return (
            <div key={row} className="mb-5">
              <div className="relative rounded-2xl overflow-hidden py-5" style={{ background:"#1A0A04", border:"1px solid #2A1408" }}>
                <div className="absolute bottom-0 left-0 right-0 h-3" style={{ background:"#3D1F0A", boxShadow:"0 4px 16px rgba(0,0,0,0.5)" }} />
                <div className="flex items-end justify-center gap-2 sm:gap-4 px-4 sm:px-8 pb-3">
                  {rowBooks.map(book => <BookSpine key={book.id} book={book} completed={(stats.completedBooks??[]).includes(book.id)} onClick={() => onBook(book)} />)}
                </div>
              </div>
            </div>
          );
        })}

        {/* List */}
        <h3 className="font-display text-sm font-medium mb-3 mt-6" style={{ color:"#5C3518", letterSpacing:"0.1em", textTransform:"uppercase" }}>Todas las obras</h3>
        <div className="space-y-1.5">
          {BOOKS.map(book => (
            <button key={book.id} onClick={() => onBook(book)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all hover:border-amber-900 group" style={{ background:"#1A0C04", borderColor:"#2A1408" }}>
              <div className="w-1 h-9 rounded-full flex-shrink-0" style={{ background:book.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate" style={{ color:"#F5ECD7" }}>{book.title}</span>
                  {(stats.completedBooks??[]).includes(book.id) && <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded" style={{ background:"rgba(212,168,83,0.15)", color:"#D4A853" }}>✓</span>}
                </div>
                <span className="text-xs" style={{ color:"#5C3518" }}>{book.author} · {book.year}</span>
              </div>
              <span style={{ color:"#3D1F0A" }} className="group-hover:text-amber-800 transition-colors flex-shrink-0">›</span>
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
      <div className="spine-inner rounded-sm flex flex-col items-center justify-between py-2 relative" style={{ width:40, height:140, background:book.color, borderLeft:`4px solid ${book.spine}`, boxShadow:"2px 4px 12px rgba(0,0,0,0.5)" }}>
        {completed && <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-xs z-10 font-bold" style={{ background:"#D4A853", color:"#120A04" }}>✓</div>}
        <div className="flex-1 flex items-center justify-center overflow-hidden px-1" style={{ writingMode:"vertical-rl", transform:"rotate(180deg)" }}>
          <span className="font-display font-bold text-center leading-tight" style={{ color:"rgba(255,255,255,0.92)", fontSize:"10px" }}>{book.title}</span>
        </div>
        <span style={{ fontSize:"8px", color:"rgba(255,255,255,0.5)", writingMode:"vertical-rl", transform:"rotate(180deg)" }}>{book.author.split(" ").pop()}</span>
      </div>
    </div>
  );
}

// ── BookDetailScreen ──────────────────────────────────────────────────────────
type BookMode = "quiz"|"flashcards"|"debate"|"forum";
function BookDetailScreen({ book, stats, onMode, onBack }: { book: Book; stats: Stats; onMode: (m: BookMode) => void; onBack: () => void }) {
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
              <p className="text-sm" style={{ color:"#7A5C3E" }}>3 dificultades · Fácil · Medio · Difícil</p>
              <p className="text-xs mt-1" style={{ color:"#5C3518" }}>{book.questions.length} preguntas · +10 pts por respuesta</p>
            </div>
            <span className="text-2xl" style={{ color:book.color }}>›</span>
          </div>
        </button>

        {/* Secondary modes */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            {mode:"flashcards",icon:"🃏",title:"Flashcards",desc:`${book.flashcards.length} tarjetas · Fácil & Medio`,note:"No disponible en Difícil",color:"#5C8A3E"},
            {mode:"debate",icon:"⚖️",title:"Debate",desc:"Argumenta y compite por likes",color:"#7A3A9A"},
            {mode:"forum",icon:"💬",title:"Foro",desc:"Preguntas y respuestas",color:"#1A6A8A"},
          ] as {mode:BookMode,icon:string,title:string,desc:string,note?:string,color:string}[]).map(({mode,icon,title,desc,note,color}) => (
            <button key={mode} onClick={() => onMode(mode)} className="text-left rounded-2xl p-4 border transition-all hover:scale-[1.02] active:scale-[0.98]" style={{ background:"#1A0C04", borderColor:"#2A1408" }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3" style={{ background:color+"22" }}>{icon}</div>
              <div className="font-semibold text-sm mb-1" style={{ color }}>{title}</div>
              <div className="text-xs" style={{ color:"#5C3518" }}>{desc}</div>
              {note && <div className="text-xs mt-1" style={{ color:"#3D1F0A" }}>{note}</div>}
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
  const difficulties: { d: Difficulty; label: string; emoji: string; color: string; bg: string; pts: string; flash: boolean; note: string }[] = [
    { d:"easy", label:"Fácil", emoji:"🌱", color:"#5C8A3E", bg:"rgba(92,138,62,0.15)", pts:"+8 pts/correcta", flash:true, note:"Flashcards disponibles · Conceptos básicos" },
    { d:"medium", label:"Medio", emoji:"⚡", color:"#D4A853", bg:"rgba(212,168,83,0.12)", pts:"+10 pts/correcta", flash:true, note:"Flashcards disponibles · Análisis profundo" },
    { d:"hard", label:"Difícil", emoji:"💀", color:"#C87941", bg:"rgba(200,121,65,0.15)", pts:"+15 pts/correcta · Medalla si perfecto", flash:false, note:"Sin flashcards · Preguntas de síntesis" },
  ];
  return (
    <div className="min-h-screen pb-20 sm:pb-8 screen-enter" style={{ background:"#120A04" }}>
      <div className="max-w-lg mx-auto px-4 py-6">
        <button onClick={onBack} className="flex items-center gap-2 text-sm mb-5 hover:opacity-70" style={{ color:"#7A5C3E" }}>‹ {book.title}</button>
        <h2 className="font-display text-2xl font-bold mb-1" style={{ color:"#F5ECD7" }}>Elige la dificultad</h2>
        <p className="text-sm mb-6" style={{ color:"#5C3518" }}>Completa en Difícil con puntaje perfecto para ganar la medalla {book.badgeIcon}</p>
        <div className="space-y-3">
          {difficulties.map(({ d, label, emoji, color, bg, pts, flash, note }) => (
            <button key={d} onClick={() => onSelect(d)} disabled={counts[d] === 0} className="w-full text-left rounded-2xl border p-5 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-30" style={{ background:bg, borderColor:color+"44" }}>
              <div className="flex items-center gap-4">
                <span className="text-3xl">{emoji}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-lg" style={{ color }}>{label}</span>
                    {!flash && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background:"rgba(139,26,26,0.3)", color:"#F08080" }}>Sin flashcards</span>}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color:"#7A5C3E" }}>{note}</p>
                  <p className="text-xs mt-1 font-medium" style={{ color }}>{pts}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-bold" style={{ color }}>{counts[d]}</div>
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
function QuizScreen({ book, user, difficulty, onDone, onBack }: { book: Book; user: User|null; difficulty: Difficulty; onDone: (pts: number, perfect: boolean) => void; onBack: () => void }) {
  const ptsMap: Record<Difficulty,number> = { easy:8, medium:10, hard:15 };
  const N = Math.min(8, book.questions.filter(q=>q.difficulty===difficulty).length || book.questions.length);
  const [questions] = useState(() => selectQuestions(book.questions, N, difficulty));
  const [current, setCurrent] = useState(0); const [selected, setSelected] = useState<number|null>(null);
  const [answered, setAnswered] = useState(false); const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false); const [highlight, setHighlight] = useState<string|null>(null);
  const q = questions[current];
  const isHL = q.mode === "highlight";
  const pct = ((current+(answered?1:0))/N)*100;

  function choose(i: number) {
    if (answered) return; setSelected(i); setAnswered(true);
    if (i===q.correct) setScore(s=>s+1);
  }
  function chooseHL(s: string) {
    if (answered) return; setHighlight(s); setAnswered(true);
    if (s===q.correctHighlight) setScore(sc=>sc+1);
  }
  function next() {
    if (current<N-1) { setCurrent(c=>c+1); setSelected(null); setAnswered(false); setHighlight(null); }
    else { const pts=score*ptsMap[difficulty]; const perfect=score===N; setFinished(true); if(user) awardPoints(user.uid,pts); onDone(pts,perfect); }
  }

  if (finished) return (
    <div className="min-h-screen flex items-center justify-center p-4 screen-enter" style={{ background:"#120A04" }}>
      <div className="text-center max-w-sm w-full">
        <div className="text-6xl mb-4">{score>=N*0.8?"🏆":score>=N*0.5?"⭐":"📖"}</div>
        <h2 className="font-display text-5xl font-bold mb-2" style={{ color:"#D4A853" }}>{score}/{N}</h2>
        <p className="mb-2" style={{ color:"#7A5C3E" }}>{score>=N*0.8?"¡Excelente análisis!":score>=N*0.5?"¡Buen trabajo!":"Sigue practicando"}</p>
        {score===N && difficulty==="hard" && <p className="text-sm mb-1" style={{ color:book.color }}>🏅 ¡Medalla {book.badgeIcon} {book.badgeName} desbloqueada!</p>}
        <p className="text-sm mb-6" style={{ color:"#5C3518" }}>+{score*ptsMap[difficulty]} puntos ganados</p>
        <button onClick={onBack} className="px-8 py-3 rounded-2xl font-bold transition-all hover:opacity-90" style={{ background:"#D4A853", color:"#120A04" }}>Volver al libro</button>
      </div>
    </div>
  );

  const correct = selected===q.correct || (isHL&&highlight===q.correctHighlight);
  return (
    <div className="min-h-screen pb-20 sm:pb-8 screen-enter" style={{ background:"#120A04" }}>
      <div className="max-w-xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="text-sm hover:opacity-70" style={{ color:"#7A5C3E" }}>‹ {book.title}</button>
          <span className="text-xs px-2 py-1 rounded-full" style={{ background:"#2A1408", color:{"easy":"#5C8A3E","medium":"#D4A853","hard":"#C87941"}[difficulty] }}>{{easy:"🌱 Fácil",medium:"⚡ Medio",hard:"💀 Difícil"}[difficulty]}</span>
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
        <span className="text-xs" style={{ color:"#5C3518" }}>#{q.concept}</span>
        {q.fragment && (
          <blockquote className="rounded-2xl p-4 my-4 border-l-4 text-sm leading-relaxed italic" style={{ background:"#1A0C04", borderColor:"#3D1F0A", color:"#EDE0C4" }}>
            {isHL && !answered ? <HighlightableText text={q.fragment} onSelect={chooseHL} options={q.options} /> : q.fragment}
          </blockquote>
        )}
        <h2 className="font-display text-xl font-semibold my-4" style={{ color:"#F5ECD7" }}>{q.text}</h2>
        {!isHL && (
          <div className="space-y-2.5">
            {q.options.map((opt,i) => {
              let bg="#1A0C04", border="#2A1408", color="#F5ECD7";
              if (answered) {
                if (i===q.correct){bg="rgba(92,138,62,0.2)";border="#5C8A3E";color="#9CCF6B";}
                else if (i===selected){bg="rgba(139,26,26,0.2)";border="#8B1A1A";color="#F08080";}
                else {color="#3D1F0A";}
              } else if (selected===i){border="#D4A853";}
              return (
                <button key={i} onClick={()=>choose(i)} disabled={answered} className="w-full text-left px-4 py-3.5 rounded-2xl border text-sm transition-all" style={{ background:bg, borderColor:border, color }}>
                  <span className="font-mono mr-3 text-xs opacity-50">{String.fromCharCode(65+i)}</span>{opt}
                </button>
              );
            })}
          </div>
        )}
        {answered && (
          <div className="mt-4 rounded-2xl p-4 text-sm screen-enter" style={{ background:correct?"rgba(92,138,62,0.15)":"rgba(139,26,26,0.15)", color:"#EDE0C4" }}>
            <p className="font-bold mb-1" style={{ color:correct?"#9CCF6B":"#F08080" }}>{correct?"✓ Correcto":"✗ Incorrecto"}</p>
            <p>{correct?q.feedback:q.feedbackAlt}</p>
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
      <p className="text-xs mb-2 not-italic" style={{ color:"#7A5C3E" }}>Selecciona la frase correcta:</p>
      <div className="space-y-1.5">
        {options.map((opt,i) => (
          <button key={i} onClick={() => onSelect(opt)} className="block w-full text-left px-3 py-2 rounded-lg border text-sm transition-all hover:border-amber-700 italic" style={{ background:"#120A04", borderColor:"#3D1F0A", color:"#EDE0C4" }}>"{opt}"</button>
        ))}
      </div>
    </div>
  );
}

// ── FlashcardScreen ───────────────────────────────────────────────────────────
function FlashcardScreen({ book, onBack }: { book: Book; onBack: () => void }) {
  const [idx, setIdx] = useState(0); const [flipped, setFlipped] = useState(false);
  const cards = book.flashcards; const card = cards[idx];
  return (
    <div className="min-h-screen pb-20 sm:pb-8 screen-enter" style={{ background:"#120A04" }}>
      <div className="max-w-lg mx-auto px-4 py-6">
        <button onClick={onBack} className="text-sm mb-5 hover:opacity-70 block" style={{ color:"#7A5C3E" }}>‹ {book.title}</button>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-semibold" style={{ color:"#F5ECD7" }}>🃏 Flashcards</h2>
          <span className="text-sm" style={{ color:"#5C3518" }}>{idx+1}/{cards.length}</span>
        </div>
        <div onClick={() => setFlipped(f=>!f)} className="cursor-pointer rounded-3xl border p-8 min-h-56 flex flex-col items-center justify-center text-center transition-all select-none" style={{ background:flipped?"#2A1408":"#1E0E04", borderColor:flipped?"#5C3518":"#2A1408", transform:flipped?"none":"none" }}>
          <p className="text-xs tracking-widest uppercase mb-4" style={{ color:"#5C3518" }}>{flipped?"Respuesta":"Pregunta"}</p>
          <p className="font-display text-lg leading-relaxed" style={{ color:flipped?"#D4A853":"#F5ECD7" }}>{flipped?card.back:card.front}</p>
          <p className="text-xs mt-4" style={{ color:"#3D1F0A" }}>Toca para {flipped?"ver la pregunta":"ver la respuesta"}</p>
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
    await addDoc(collection(db, colId), { user:user.email?.split("@")[0]??"Anónimo", text:text.trim(), ts:Date.now(), likes:0, likedBy:[] });
    setText(""); fetch();
    awardPoints(user.uid, 5);
    try { await updateDoc(doc(db,"users",user.uid),{ totalDebates:increment(1) }); } catch {}
  }
  async function toggleLike(p: DebatePost) {
    if (!user) { onLoginNeeded(); return; }
    const ref = doc(db, colId, p.id);
    const liked = p.likedBy.includes(user.uid);
    await updateDoc(ref, liked ? { likes:increment(-1), likedBy:arrayRemove(user.uid) } : { likes:increment(1), likedBy:arrayUnion(user.uid) });
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
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg" style={{ background:book.color }}>{book.badgeIcon}</div>
          <div>
            <h2 className="font-bold text-base" style={{ color:"#F5ECD7" }}>r/{book.id}</h2>
            <p className="text-xs" style={{ color:"#5C3518" }}>{posts.length} posts · Foro de {book.title}</p>
          </div>
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
type Screen = "home"|"book"|"quiz-difficulty"|"quiz"|"flashcards"|"debate"|"forum"|"profile";

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

  async function handleQuizDone(pts: number, perfect: boolean) {
    refreshStats();
    if (perfect && quizDifficulty==="hard" && selectedBook && user) {
      const booksHard = [...(stats.completedBooksHard??[])];
      if (!booksHard.includes(selectedBook.id)) {
        booksHard.push(selectedBook.id);
        await updateDoc(doc(db,"users",user.uid),{ completedBooksHard:booksHard, completedBooks:arrayUnion(selectedBook.id), totalQuizzes:increment(1) });
        setStats(prev => ({ ...prev, completedBooksHard:booksHard }));
      }
    } else if (user && selectedBook) {
      await updateDoc(doc(db,"users",user.uid),{ completedBooks:arrayUnion(selectedBook.id), totalQuizzes:increment(1) });
    }
    refreshStats();
    setScreen("book");
  }

  function handleTabChange(t: Tab) {
    setTab(t); if (t==="library") setScreen("home"); else setScreen("profile");
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
      {screen==="profile" && <ProfileScreen user={user} stats={stats} onLoginClick={() => setShowLogin(true)} onLogout={handleLogout} />}
      {screen==="book" && selectedBook && <BookDetailScreen book={selectedBook} stats={stats} onMode={handleBookMode} onBack={() => { setScreen("home"); setTab("library"); }} />}
      {screen==="quiz-difficulty" && selectedBook && <QuizDifficultyScreen book={selectedBook} onSelect={d => { setQuizDifficulty(d); setScreen("quiz"); }} onBack={() => setScreen("book")} />}
      {screen==="quiz" && selectedBook && <QuizScreen book={selectedBook} user={user} difficulty={quizDifficulty} onDone={handleQuizDone} onBack={() => setScreen("quiz-difficulty")} />}
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
