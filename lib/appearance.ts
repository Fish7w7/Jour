export const themes = { light: "Claro", dark: "Escuro", auto: "Automático" } as const;
export const accentColors = { original: "Original", lavender: "Lavanda", sage: "Sálvia", coral: "Coral", graphite: "Grafite" } as const;
export const cardStyles = { original: "Original", aurora: "Aurora", minimal: "Minimalista", horizon: "Horizonte" } as const;

export type Appearance = {
  theme: keyof typeof themes;
  accent: keyof typeof accentColors;
  cardStyle: keyof typeof cardStyles;
};

export const appearanceDefaults: Appearance = { theme: "auto", accent: "original", cardStyle: "original" };

export function resolveAppearance({ theme, accent, cardStyle }: Pick<Appearance, "theme"> & Partial<Appearance>): Appearance {
  return { theme, accent: accent ?? appearanceDefaults.accent, cardStyle: cardStyle ?? appearanceDefaults.cardStyle };
}
