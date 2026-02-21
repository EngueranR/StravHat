import { useEffect, useLayoutEffect, useRef, useState } from "react";

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
    keywords: ["euclid", "distance euclidienne", "similarite"],
    description:
      "La distance euclidienne compare la proximite multi-dimensionnelle entre observations.",
    linkHref: "https://en.wikipedia.org/wiki/Euclidean_distance",
    linkLabel: "Source: Distance euclidienne",
  },
  {
    keywords: ["normalisation", "base 100", "index"],
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

const PANEL_GAP = 8;
const PANEL_MARGIN = 8;
const PANEL_MAX_WIDTH = 384;
const MIN_PREFERRED_HEIGHT = 220;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalize(value: string) {
  return value.toLowerCase();
}

function hasAnyKeyword(haystack: string, keywords: string[]) {
  return keywords.some((keyword) => haystack.includes(normalize(keyword)));
}

function buildCalculationNotes(title: string, description: string) {
  const haystack = normalize(`${title} ${description}`);
  const notes: string[] = [];
  const add = (note: string) => {
    if (!notes.includes(note)) {
      notes.push(note);
    }
  };

  if (hasAnyKeyword(haystack, ["ctl", "atl", "tsb", "charge", "fatigue", "forme"])) {
    add("Charge, CTL et ATL sont en points de charge (pas en %). Exemple: 83 = 83 points.");
    add("CTL = EMA de la charge sur 42 jours (forme de fond).");
    add("ATL = EMA de la charge sur 7 jours (fatigue recente).");
    add("TSB = CTL - ATL (fraicheur).");
    add("ATL/CTL et Charge/CTL sont des ratios sans unite: 1.00 = 100%, 1.30 = 130%.");
  }

  if (hasAnyKeyword(haystack, ["zone cardiaque", "zones cardiaques", "fc max", "heart rate"])) {
    add("% FCmax = (FC / FCmax) x 100, puis classement en zones (Z1..Z5).");
  }

  if (hasAnyKeyword(haystack, ["riegel", "temps de reference", "marathon", "semi"])) {
    add("Projection Riegel: temps2 = temps1 x (distance2 / distance1)^1.06.");
  }

  if (hasAnyKeyword(haystack, ["z-score", "standard score"])) {
    add("Standardisation: z = (valeur - moyenne) / ecart-type.");
  }

  if (hasAnyKeyword(haystack, ["euclid", "similarit", "proximite"])) {
    add("Similarite: distance euclidienne = sqrt(sum((zi - zref)^2)).");
  }

  if (hasAnyKeyword(haystack, ["base 100", "indexee", "normalisation"])) {
    add("Index base 100: index = (valeur / valeur de reference) x 100.");
  }

  if (hasAnyKeyword(haystack, ["histogram", "distribution"])) {
    add("Histogramme: chaque barre compte les activites dans un intervalle [from, to].");
  }

  if (hasAnyKeyword(haystack, ["pivot", "avg", "moyenne", "somme"])) {
    add("Pivot: colonnes avg* = moyenne des lignes du groupe, autres colonnes = somme.");
  }

  if (hasAnyKeyword(haystack, ["spearman", "rho", "correlation"])) {
    add("Correlation: rho/r varie de -1 a +1 (0 = pas de relation monotone/lineaire).");
  }

  if (hasAnyKeyword(haystack, ["cohen", "effect size"])) {
    add("Effet (Cohen d) = (moyenne recente - moyenne debut) / ecart-type combine.");
  }

  if (hasAnyKeyword(haystack, ["regression", "trend", "tendance"])) {
    add("Ligne de tendance: regression lineaire y = a*x + b (a = pente moyenne).");
  }

  return notes.slice(0, 6);
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
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);
  const detected = pickSourceHint(title, description);
  const source = detected ?? DEFAULT_SOURCE;
  const resolvedLinkHref = linkHref ?? source.linkHref;
  const resolvedLinkLabel = linkLabel ?? source.linkLabel;
  const calculationNotes = buildCalculationNotes(title, description);
  const enrichedDescription = description.includes(source.description)
    ? description
    : `${description} ${source.description}`;

  const updatePosition = () => {
    const trigger = triggerRef.current;

    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const width = Math.min(PANEL_MAX_WIDTH, window.innerWidth - PANEL_MARGIN * 2);
    const left = clamp(
      rect.right - width,
      PANEL_MARGIN,
      Math.max(PANEL_MARGIN, window.innerWidth - width - PANEL_MARGIN),
    );
    const spaceBelow = window.innerHeight - rect.bottom - PANEL_GAP - PANEL_MARGIN;
    const spaceAbove = rect.top - PANEL_GAP - PANEL_MARGIN;

    const shouldOpenAbove =
      spaceBelow < MIN_PREFERRED_HEIGHT && spaceAbove > spaceBelow;

    if (shouldOpenAbove) {
      const bottom = window.innerHeight - rect.top + PANEL_GAP;
      const maxHeight = Math.max(0, window.innerHeight - bottom - PANEL_MARGIN);

      if (maxHeight >= 120) {
        setPosition({ left, width, bottom, maxHeight });
        return;
      }
    }

    const top = rect.bottom + PANEL_GAP;
    const maxHeight = Math.max(0, window.innerHeight - top - PANEL_MARGIN);

    if (maxHeight >= 120) {
      setPosition({ left, width, top, maxHeight });
      return;
    }

    setPosition({
      left: PANEL_MARGIN,
      width: Math.max(160, window.innerWidth - PANEL_MARGIN * 2),
      top: PANEL_MARGIN,
      maxHeight: Math.max(80, window.innerHeight - PANEL_MARGIN * 2),
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    updatePosition();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const closeOnOutsideClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;

      if (!target) {
        return;
      }

      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    const reposition = () => {
      updatePosition();
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("touchstart", closeOnOutsideClick);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("touchstart", closeOnOutsideClick);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <span className="relative inline-flex">
      <button
        aria-expanded={open}
        aria-label={`Informations: ${title}`}
        className={`${roundIconButtonClass} cursor-pointer`}
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        type="button"
      >
        i
      </button>
      {open && position ? (
        <div
          className="fixed z-[70] overflow-y-auto rounded-lg border border-black/20 bg-panel p-3 text-xs leading-relaxed text-ink shadow-panel"
          ref={panelRef}
          style={{
            left: position.left,
            width: position.width,
            ...(typeof position.top === "number" ? { top: position.top } : {}),
            ...(typeof position.bottom === "number" ? { bottom: position.bottom } : {}),
            maxHeight: position.maxHeight,
          }}
        >
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-muted">{enrichedDescription}</p>
          {calculationNotes.length > 0 ? (
            <>
              <p className="mt-2 font-semibold">Calcul utilise</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-muted">
                {calculationNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </>
          ) : null}
          <a
            className="mt-2 inline-block text-[11px] font-semibold text-accent underline-offset-2 hover:underline"
            href={resolvedLinkHref}
            rel="noreferrer"
            target="_blank"
          >
            {resolvedLinkLabel}
          </a>
        </div>
      ) : null}
    </span>
  );
}
