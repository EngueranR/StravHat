interface InfoHintProps {
  title: string;
  description: string;
  linkHref?: string;
  linkLabel?: string;
}

interface SourceHint {
  keywords: string[];
  description: string;
  linkHref: string;
  linkLabel: string;
}

const SOURCE_HINTS: SourceHint[] = [
  {
    keywords: ["spearman", "rho"],
    description:
      "Spearman mesure une relation monotone robuste aux non-linearites et aux outliers.",
    linkHref:
      "https://en.wikipedia.org/wiki/Spearman%27s_rank_correlation_coefficient",
    linkLabel: "Source: Spearman",
  },
  {
    keywords: ["pearson", "correlation"],
    description:
      "Une correlation quantifie l'association lineaire, mais ne demontre pas une causalite.",
    linkHref: "https://en.wikipedia.org/wiki/Pearson_correlation_coefficient",
    linkLabel: "Source: Pearson",
  },
  {
    keywords: ["cohen", "effect size"],
    description:
      "Cohen d evalue l'ampleur pratique d'une difference, pas seulement sa direction.",
    linkHref: "https://en.wikipedia.org/wiki/Effect_size#Cohen's_d",
    linkLabel: "Source: Cohen d",
  },
  {
    keywords: ["regression", "trend", "tendance"],
    description:
      "La regression lineaire estime une pente moyenne et aide a resumer l'evolution globale.",
    linkHref: "https://en.wikipedia.org/wiki/Linear_regression",
    linkLabel: "Source: Regression",
  },
  {
    keywords: ["z-score", "standard score"],
    description:
      "La standardisation (z-score) ramene les variables sur une echelle comparable.",
    linkHref: "https://en.wikipedia.org/wiki/Standard_score",
    linkLabel: "Source: Z-score",
  },
  {
    keywords: ["euclid", "distance"],
    description:
      "La distance euclidienne compare la proximite multi-dimensionnelle entre observations.",
    linkHref: "https://en.wikipedia.org/wiki/Euclidean_distance",
    linkLabel: "Source: Distance euclidienne",
  },
  {
    keywords: ["normal", "base 100", "index"],
    description:
      "La normalisation en base 100 permet de comparer des trajectoires de metriques differentes.",
    linkHref: "https://en.wikipedia.org/wiki/Normalization_(statistics)",
    linkLabel: "Source: Normalisation",
  },
  {
    keywords: ["histogram", "distribution"],
    description:
      "Un histogramme met en evidence la concentration, la dispersion et les queues de distribution.",
    linkHref: "https://en.wikipedia.org/wiki/Histogram",
    linkLabel: "Source: Histogramme",
  },
  {
    keywords: ["ctl", "atl", "tsb", "charge", "fatigue", "forme"],
    description:
      "Le suivi de charge interne/externe aide a interpreter forme, fatigue et risque de surcharge.",
    linkHref: "https://pubmed.ncbi.nlm.nih.gov/24410871/",
    linkLabel: "Source: monitoring charge",
  },
  {
    keywords: ["intensite", "intensity", "zone"],
    description:
      "La distribution d'intensite est un levier majeur de progression en endurance.",
    linkHref: "https://pubmed.ncbi.nlm.nih.gov/20861519/",
    linkLabel: "Source: intensite endurance",
  },
  {
    keywords: ["calorie", "met", "energie"],
    description:
      "L'estimation energetique peut varier selon les modeles; il faut privilegier la coherence longitudinale.",
    linkHref: "https://sites.google.com/site/compendiumofphysicalactivities/",
    linkLabel: "Source: Compendium MET",
  },
  {
    keywords: ["foulee", "stride length", "longueur de foulee"],
    description:
      "La longueur de foulee doit etre interpretee avec la cadence et la vitesse pour evaluer l'economie de course.",
    linkHref: "https://pubmed.ncbi.nlm.nih.gov/28263283/",
    linkLabel: "Source: running biomechanics",
  },
  {
    keywords: ["contact au sol", "ground contact", "gct"],
    description:
      "Le temps de contact au sol est un marqueur mecanique lie a la vitesse, a l'economie de course et a la fatigue.",
    linkHref: "https://pubmed.ncbi.nlm.nih.gov/38446400/",
    linkLabel: "Source: running economy review",
  },
  {
    keywords: ["oscillation verticale", "vertical oscillation"],
    description:
      "L'oscillation verticale s'interprete avec l'allure et la foullee pour apprecier l'efficience du mouvement.",
    linkHref: "https://pubmed.ncbi.nlm.nih.gov/28263283/",
    linkLabel: "Source: running biomechanics",
  },
];

const DEFAULT_SOURCE: SourceHint = {
  keywords: [],
  description:
    "Reference generale sur activite physique et interpretation prudente des indicateurs de sante/performance.",
  linkHref: "https://www.ncbi.nlm.nih.gov/books/NBK566045/",
  linkLabel: "Source: WHO 2020",
};

function normalize(value: string) {
  return value.toLowerCase();
}

function pickSourceHint(title: string, description: string) {
  const haystack = normalize(`${title} ${description}`);
  return SOURCE_HINTS.find((entry) =>
    entry.keywords.some((keyword) => haystack.includes(normalize(keyword))),
  );
}

export const roundIconButtonClass =
  "inline-flex h-7 w-7 items-center justify-center rounded-full border border-black/25 bg-panel text-[11px] font-semibold leading-none text-ink transition hover:bg-black/5";

export function InfoHint({ title, description, linkHref, linkLabel }: InfoHintProps) {
  const detected = pickSourceHint(title, description);
  const source = detected ?? DEFAULT_SOURCE;
  const resolvedLinkHref = linkHref ?? source.linkHref;
  const resolvedLinkLabel = linkLabel ?? source.linkLabel;
  const enrichedDescription = description.includes(source.description)
    ? description
    : `${description} ${source.description}`;

  return (
    <details className="group relative">
      <summary className="list-none [&::-webkit-details-marker]:hidden">
        <span className={`${roundIconButtonClass} cursor-pointer`}>
          i
        </span>
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-72 max-w-[min(18rem,calc(100vw-1.5rem))] rounded-lg border border-black/20 bg-panel p-3 text-xs leading-relaxed text-ink shadow-panel">
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-muted">{enrichedDescription}</p>
        <a
          className="mt-2 inline-block text-[11px] font-semibold text-accent underline-offset-2 hover:underline"
          href={resolvedLinkHref}
          rel="noreferrer"
          target="_blank"
        >
          {resolvedLinkLabel}
        </a>
      </div>
    </details>
  );
}
