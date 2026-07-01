export interface AdvisorConfig {
  /** Короткое имя / подпись (EN, списки) */
  name: string;
  contact: string;
  /** Дательный: «запишитесь к …» */
  dative: string;
  /** Творительный: «планирование с …» */
  instrumental: string;
}

const DEFAULT = {
  name: "финансовый советник",
  dative: "финансовому советнику",
  instrumental: "финансовым советником",
  contact: "Telegram: @fin_108",
};

/** Старый ADVISOR_NAME часто был в творительном («…советником») — не подходит для «к». */
function looksInstrumentalRu(s: string): boolean {
  return /\b(?:[а-яё]+(?:ом|ем|ой|ей|ою|ею)|[а-яё]+у)\s*$/i.test(s.trim());
}

function readEnv(...keys: string[]): string {
  for (const key of keys) {
    const v = process.env[key]?.trim();
    if (v) return v;
  }
  return "";
}

export function getAdvisorConfig(): AdvisorConfig {
  const contact = readEnv("ADVISOR_CONTACT", "NEXT_PUBLIC_ADVISOR_CONTACT") || DEFAULT.contact;
  const rawName = readEnv("ADVISOR_NAME", "NEXT_PUBLIC_ADVISOR_NAME");
  const dativeEnv = readEnv("ADVISOR_NAME_DATIVE", "NEXT_PUBLIC_ADVISOR_NAME_DATIVE");
  const instrumentalEnv = readEnv(
    "ADVISOR_NAME_INSTRUMENTAL",
    "NEXT_PUBLIC_ADVISOR_NAME_INSTRUMENTAL",
  );

  if (dativeEnv || instrumentalEnv) {
    return {
      name: rawName || DEFAULT.name,
      contact,
      dative: dativeEnv || rawName || DEFAULT.dative,
      instrumental: instrumentalEnv || rawName || DEFAULT.instrumental,
    };
  }

  if (!rawName) {
    return { ...DEFAULT, contact };
  }

  if (looksInstrumentalRu(rawName)) {
    return {
      name: DEFAULT.name,
      contact,
      dative: DEFAULT.dative,
      instrumental: rawName,
    };
  }

  return {
    name: rawName,
    contact,
    dative: rawName,
    instrumental: rawName,
  };
}

/** «запишитесь к финансовому советнику: …» */
export function advisorInviteRu(advisor: AdvisorConfig): string {
  return `запишитесь к ${advisor.dative}: ${advisor.contact}`;
}

/** «запишитесь на консультацию к …: …» */
export function advisorBookConsultRu(advisor: AdvisorConfig): string {
  return `запишитесь на консультацию к ${advisor.dative}: ${advisor.contact}`;
}

/** «Нужен совет — обращайтесь к финансовому советнику: …» */
export function advisorPlanningWithRu(advisor: AdvisorConfig): string {
  return `Нужен совет — обращайтесь к ${advisor.dative}: ${advisor.contact}`;
}
