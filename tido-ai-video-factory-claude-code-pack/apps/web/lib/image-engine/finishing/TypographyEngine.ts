export interface CopyElementInput {
  text: string;
  role: "HEADLINE" | "SUBTITLE" | "CTA" | "PRICE";
}

export interface TypographyOptions {
  canvasWidth: number;
  canvasHeight: number;
  fontFamilyHeader?: string;
  fontFamilyBody?: string;
  primaryTextColor?: string;
  accentBgColor?: string;
}

export interface TypographyRenderResult {
  success: boolean;
  renderedElementsCount: number;
  renderedDirectives: Array<{
    role: string;
    text: string;
    coordinates: { x: number; y: number; width: number; height: number };
    fontSizePx: number;
    color: string;
  }>;
  overlaySummary: string;
}

export class TypographyEngine {
  /**
   * Typography Engine:
   * Handles rendering of authorized copy text elements (headline, subtitle, CTA button, price badge).
   * Strictly decoupled from logo rendering and never modifies AI product image pixels.
   */
  public renderCopyElements(
    copyItems: CopyElementInput[],
    options: TypographyOptions
  ): TypographyRenderResult {
    const canvasWidth = options.canvasWidth || 1080;
    const canvasHeight = options.canvasHeight || 1350;

    const renderedDirectives: TypographyRenderResult["renderedDirectives"] = [];

    let currentY = canvasHeight * 0.08; // Top margin 8%

    for (const item of copyItems) {
      if (!item.text || !item.text.trim()) continue;

      const text = item.text.trim();

      if (item.role === "HEADLINE") {
        const fontSizePx = Math.round(canvasWidth * 0.065); // 6.5% of canvas width
        renderedDirectives.push({
          role: "HEADLINE",
          text,
          coordinates: {
            x: Math.round(canvasWidth * 0.08),
            y: Math.round(currentY),
            width: Math.round(canvasWidth * 0.84),
            height: Math.round(fontSizePx * 1.3),
          },
          fontSizePx,
          color: options.primaryTextColor || "#FFFFFF",
        });
        currentY += fontSizePx * 1.5;
      } else if (item.role === "SUBTITLE") {
        const fontSizePx = Math.round(canvasWidth * 0.038); // 3.8% of canvas width
        renderedDirectives.push({
          role: "SUBTITLE",
          text,
          coordinates: {
            x: Math.round(canvasWidth * 0.08),
            y: Math.round(currentY),
            width: Math.round(canvasWidth * 0.84),
            height: Math.round(fontSizePx * 1.3),
          },
          fontSizePx,
          color: options.primaryTextColor || "#E2E8F0",
        });
        currentY += fontSizePx * 1.5;
      } else if (item.role === "CTA") {
        const fontSizePx = Math.round(canvasWidth * 0.032);
        const ctaY = canvasHeight * 0.88; // Lower 12% space
        renderedDirectives.push({
          role: "CTA",
          text,
          coordinates: {
            x: Math.round(canvasWidth * 0.60),
            y: Math.round(ctaY),
            width: Math.round(canvasWidth * 0.32),
            height: Math.round(fontSizePx * 2.2),
          },
          fontSizePx,
          color: options.accentBgColor || "#2563EB",
        });
      } else if (item.role === "PRICE") {
        const fontSizePx = Math.round(canvasWidth * 0.045);
        const priceY = canvasHeight * 0.88;
        renderedDirectives.push({
          role: "PRICE",
          text,
          coordinates: {
            x: Math.round(canvasWidth * 0.08),
            y: Math.round(priceY),
            width: Math.round(canvasWidth * 0.25),
            height: Math.round(fontSizePx * 2.0),
          },
          fontSizePx,
          color: "#10B981",
        });
      }
    }

    const overlaySummary = `[DETERMINISTIC_TYPOGRAPHY_OVERLAY] Rendered ${renderedDirectives.length} copy elements (Headline, Subtitle, CTA, Price) with vector typography hierarchy. Zero AI text rendering in base scene pixels.`;

    return {
      success: true,
      renderedElementsCount: renderedDirectives.length,
      renderedDirectives,
      overlaySummary,
    };
  }
}
