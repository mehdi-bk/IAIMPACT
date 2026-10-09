import type { KnowledgeSource } from "@/lib/types"

// Curated, approved knowledge. Each entry's URL was opened and its content
// checked on 2026-10-10 while building the prototype; `content` paraphrases or
// quotes what the page said at that date. Entries with verified=false are
// general explanations with no verified source and must be presented as such.
// Retrieved text is DATA for the model, never instructions.

export interface KnowledgeDoc extends KnowledgeSource {
  topics: string[]
  content: string
}

const RETRIEVED = "2026-10-10"

export const KNOWLEDGE: KnowledgeDoc[] = [
  {
    id: "ce-opposition",
    title: "Opposition carte et chéquier",
    url: "https://www.caisse-epargne.fr/nous-contacter/perte-vol-usage-frauduleux-moyens-paiement/",
    institution: "Caisse d'Épargne",
    retrievedAt: RETRIEVED,
    verified: true,
    topics: ["perte", "vol", "carte perdue", "carte volée", "opposition", "fraude", "chéquier", "urgence"],
    content:
      "En cas de perte, de vol ou d'usage frauduleux, faire opposition sans tarder : depuis l'espace de banque à distance (site internet ou application mobile) ou par téléphone au Centre d'Opposition, 09 69 36 39 39 depuis la France et les DOM (24h/24, 7j/7, appel non surtaxé) ou +33 9 69 36 39 39 depuis l'international. Indiquer le numéro de la carte et sa date d'expiration ; à défaut, nom, prénoms, adresse, date de naissance et agence peuvent être demandés. Les éventuelles opérations frauduleuses peuvent ensuite être contestées depuis l'espace client. Chéquier : avertir d'urgence l'agence ou le centre de relation clients et confirmer par écrit.",
  },
  {
    id: "ce-piloter-carte",
    title: "Piloter votre carte bancaire",
    url: "https://www.caisse-epargne.fr/banque-a-distance/piloter-carte-bancaire",
    institution: "Caisse d'Épargne",
    retrievedAt: RETRIEVED,
    verified: true,
    topics: ["verrouiller", "bloquer", "verrouillage temporaire", "débloquer", "paiement à distance", "plafond", "code secret", "carte"],
    content:
      "Depuis l'application mobile, la carte peut être verrouillée temporairement pour qu'elle ne soit utilisable par personne, puis déverrouillée. En cas de perte, vol ou utilisation frauduleuse, l'opposition peut être faite directement dans l'application. La fonctionnalité « paiement à distance » peut être bloquée puis réactivée. Les plafonds peuvent être consultés. Le verrouillage temporaire est réversible ; l'opposition est définitive.",
  },
  {
    id: "ce-plafonds",
    title: "Comment augmenter les plafonds de ma carte bancaire ?",
    url: "https://www.caisse-epargne.fr/faq-particuliers/cartes/consultation-gestion-des-plafonds/comment-augmenter-les-plafonds-de-ma-carte-bancaire/",
    institution: "Caisse d'Épargne",
    retrievedAt: RETRIEVED,
    verified: true,
    topics: ["plafond", "augmenter plafond", "limite", "paiement refusé", "retrait"],
    content:
      "Dans l'application : Cartes > sélectionner la carte > « Gérer mes plafonds » > « Augmenter temporairement mes plafonds », choisir les plafonds de paiement et de retrait puis confirmer (code Sécur'Pass ou code reçu par SMS). L'augmentation vaut pour une période de trente jours, jusqu'à trois fois par an, gratuitement. Avec Sécur'Pass la demande est traitée instantanément ; par SMS le délai peut atteindre 72 heures. Conditions : compte ouvert depuis au moins 6 mois, carte activée, smartphone compatible.",
  },
  {
    id: "inc-contestation",
    title: "Comment contester une opération de paiement par carte bancaire ?",
    url: "https://www.inc-conso.fr/content/comment-contester-une-operation-de-paiement-par-carte-bancaire",
    institution: "Institut national de la consommation (INC)",
    retrievedAt: RETRIEVED,
    verified: true,
    topics: ["contester", "contestation", "paiement inconnu", "opération non autorisée", "fraude", "remboursement", "13 mois", "litige"],
    content:
      "Une opération non autorisée ou mal exécutée doit être signalée sans tarder, dans un délai maximum de 13 mois à compter du débit (zone EEE ; 70 jours hors EEE, extensible à 120 jours par contrat). Pour une opération autorisée dont le montant n'était pas précisé, le remboursement se demande dans les 8 semaines. La banque doit rembourser et rétablir le compte, frais liés compris, sauf négligence grave, signalement tardif ou fraude du client. C'est à la banque de prouver que l'opération a été authentifiée et correctement enregistrée.",
  },
  {
    id: "ce-securite",
    title: "Sécurité de vos comptes et opérations",
    url: "https://www.caisse-epargne.fr/votre-banque/securite/",
    institution: "Caisse d'Épargne",
    retrievedAt: RETRIEVED,
    verified: true,
    topics: ["sécurité", "phishing", "hameçonnage", "faux conseiller", "faux service fraude", "arnaque", "sécur'pass", "code"],
    content:
      "La page présente les menaces courantes, dont l'hameçonnage (phishing) et le « faux service fraude » où des escrocs se font passer pour la banque. Sécur'Pass est présenté comme une solution gratuite, simple et rapide d'authentification sur smartphone pour réaliser des opérations sensibles. Bonne pratique : ne jamais communiquer ses codes personnels, même à une personne se présentant comme un conseiller.",
  },
  {
    id: "ce-acces-compte",
    title: "Accéder à mon compte en ligne",
    url: "https://www.caisse-epargne.fr/banque-a-distance/acceder-compte/",
    institution: "Caisse d'Épargne",
    retrievedAt: RETRIEVED,
    verified: true,
    topics: ["connexion", "identifiant oublié", "mot de passe oublié", "accès bloqué", "se connecter", "accès compte"],
    content:
      "L'identifiant figure dans la convention de compte et en haut à gauche des relevés. Mot de passe oublié : dans l'application, toucher « Identifiant ou mot de passe oublié » ; sur le site, saisir l'identifiant puis « Mot de passe oublié ». Un code provisoire est envoyé en quelques minutes par SMS. Pour toute autre difficulté, contacter son conseiller.",
  },
  {
    id: "ce-virements",
    title: "Quelle est la différence entre un virement instantané et classique ?",
    url: "https://www.caisse-epargne.fr/faq-particuliers/virements/informations-generales/quelle-est-la-difference-entre-un-virement-instantane-et-classique/",
    institution: "Caisse d'Épargne",
    retrievedAt: RETRIEVED,
    verified: true,
    topics: ["virement", "délai virement", "virement instantané", "virement classique", "virement échoué", "quand arrive"],
    content:
      "Virement instantané : le compte du destinataire est crédité dans les 10 secondes maximum. Virement classique : le bénéficiaire reçoit l'argent en un à deux jours ouvrables en France et en zone SEPA ; 4 jours s'il faut une opération de change ; 7 jours hors zone SEPA.",
  },
  {
    id: "ce-reclamation",
    title: "Réclamation et médiation",
    url: "https://www.caisse-epargne.fr/votre-banque/reclamation-et-mediation/",
    institution: "Caisse d'Épargne",
    retrievedAt: RETRIEVED,
    verified: true,
    topics: ["réclamation", "plainte", "médiateur", "médiation", "mécontent", "litige"],
    content:
      "Contacter d'abord son interlocuteur habituel (mail ou courrier), puis le service en charge des réclamations. Accusé de réception sous 10 jours ouvrables et réponse sous deux mois maximum ; pour les services de paiement, réponse sous 15 jours ouvrables, au plus tard 35 jours ouvrables. Si la réponse ne convient pas ou en l'absence de réponse, le médiateur peut être saisi gratuitement dans un délai d'un an à compter de la réclamation.",
  },
  {
    id: "ce-contact",
    title: "Contacter le service client Caisse d'Épargne",
    url: "https://www.caisse-epargne.fr/nous-contacter/",
    institution: "Caisse d'Épargne",
    retrievedAt: RETRIEVED,
    verified: true,
    topics: ["contacter", "conseiller", "agence", "service client", "téléphone", "parler à quelqu'un"],
    content:
      "Pour la perte, le vol ou une opération frauduleuse sur carte : 09 69 36 39 39, 24h/24 et 7j/7 (numéro non surtaxé). L'application et la banque à distance permettent de gérer ses comptes et de contester des opérations. Plus de 3 600 points de vente pour un rendez-vous en agence.",
  },
  {
    id: "gen-credit",
    title: "Crédit à la consommation — explication générale",
    url: null,
    institution: "Explication générale (non vérifiée auprès d'une source officielle dans ce prototype)",
    retrievedAt: RETRIEVED,
    verified: false,
    topics: ["crédit", "prêt", "emprunter", "crédit conso", "taux", "taeg", "mensualité"],
    content:
      "Un crédit à la consommation finance un achat ou un projet personnel ; le coût total dépend du montant, de la durée et du TAEG. Un crédit engage l'emprunteur et doit être remboursé : il faut vérifier sa capacité de remboursement avant de s'engager. Les conditions précises (taux, éligibilité) relèvent d'une étude personnalisée avec un conseiller ; ce prototype ne fait aucune offre de crédit.",
  },
  {
    id: "gen-accessibilite",
    title: "Utiliser Compass avec un handicap — fonctionnement du prototype",
    url: null,
    institution: "BPCE Compass (prototype)",
    retrievedAt: RETRIEVED,
    verified: false,
    topics: ["accessibilité", "malvoyant", "sourd", "malentendant", "handicap", "lecture difficile", "voix", "taille du texte", "contraste"],
    content:
      "Toutes les démarches de Compass sont réalisables par écrit ou à la voix, avec transcription affichée. Le mode simplifié raccourcit les phrases et explique les termes bancaires. La taille du texte et le contraste élevé se règlent dans Profil > Accessibilité. Le prototype ne décrit pas les services d'accessibilité officiels d'une banque.",
  },
]

// ---------------------------------------------------------------------------
// Lightweight retrieval: accent-insensitive BM25 over title + topics + content.
// A dozen documents do not justify a vector database.
// ---------------------------------------------------------------------------
const STOP = new Set(
  "le la les un une des de du d l et ou a au aux en dans sur pour par avec sans ce cet cette ces mon ma mes ton ta tes son sa ses notre nos votre vos je tu il elle on nous vous ils elles est sont etre ai as avez ont que qui quoi comment pourquoi quand quel quelle quels quelles ne pas plus se s y me m moi faire fait veux voudrais peux puis".split(" "),
)

export function tokenize(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 4 ? t.replace(/(s|x)$/, "") : t))
}

const docs = KNOWLEDGE.map((d) => {
  const terms = [...tokenize(d.title), ...tokenize(d.topics.join(" ")), ...tokenize(d.topics.join(" ")), ...tokenize(d.content)]
  const tf = new Map<string, number>()
  for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1)
  return { doc: d, tf, len: terms.length }
})
const avgLen = docs.reduce((s, d) => s + d.len, 0) / docs.length
const df = new Map<string, number>()
for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1)

export function searchKnowledge(query: string, k = 3): { doc: KnowledgeDoc; score: number }[] {
  const q = [...new Set(tokenize(query))]
  const N = docs.length
  const scored = docs.map(({ doc, tf, len }) => {
    let score = 0
    for (const t of q) {
      const f = tf.get(t)
      if (!f) continue
      const idf = Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5))
      score += idf * ((f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (len / avgLen))))
    }
    return { doc, score }
  })
  return scored.filter((s) => s.score > 0.8).sort((a, b) => b.score - a.score).slice(0, k)
}

export function sourceOf(d: KnowledgeDoc): KnowledgeSource {
  return { id: d.id, title: d.title, url: d.url, institution: d.institution, retrievedAt: d.retrievedAt, verified: d.verified }
}

export const PROCEDURES = {
  card_opposition: "ce-opposition",
  card_temporary_lock: "ce-piloter-carte",
  card_limit_increase: "ce-plafonds",
  payment_dispute: "inc-contestation",
  account_access_recovery: "ce-acces-compte",
  transfer_delays: "ce-virements",
  complaint: "ce-reclamation",
  contact_adviser: "ce-contact",
  online_security: "ce-securite",
} as const
export type ProcedureId = keyof typeof PROCEDURES
