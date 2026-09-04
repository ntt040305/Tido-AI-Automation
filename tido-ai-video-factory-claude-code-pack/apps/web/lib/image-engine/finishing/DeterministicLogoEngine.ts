export interface LogoPlacementOptions {
  canvasWidth: number;
  canvasHeight: number;
  logoBoundingBox?: {
    xPercent: number; // e.g. 5 = 5% from left
    yPercent: number; // e.g. 85 = 85% from top (bottom-left)
    widthPercent: number; // e.g. 15 = 15% width
    heightPercent: number; // e.g. 10 = 10% height
  };
  paddingPercent?: number; // Clear space around logo (default 15%)
}

export interface LogoRenderResult {
  success: boolean;
  logoPlaced: boolean;
  logoDimensions: { width: number; height: number; x: number; y: number };
  overlayInstructions: string;
}

export class DeterministicLogoEngine {
  /**
   * Deterministic Logo Engine:
   * Accurately calculates vector placement coordinates, scale, and aspect ratio locks
   * for original SVG/PNG logo assets without ever relying on AI image generation models.
   */
  public calculateLogoPlacement(
    logoAsset: { bufferBase64?: string; width?: number; height?: number; mimeType?: string },
    options: LogoPlacementOptions
  ): LogoRenderResult {
    if (!logoAsset || (!logoAsset.bufferBase64 && !logoAsset.width)) {
      return {
        success: true,
        logoPlaced: false,
        logoDimensions: { width: 0, height: 0, x: 0, y: 0 },
        overlayInstructions: "No logo asset provided. Skipping logo overlay.",
      };
    }

    const canvasWidth = options.canvasWidth || 1080;
    const canvasHeight = options.canvasHeight || 1350;

    // Default logo safe zone: Bottom-left brand mark placement with 5% margins
    const defaultBox = { xPercent: 5, yPercent: 85, widthPercent: 20, heightPercent: 10 };
    const box = options.logoBoundingBox || defaultBox;

    const targetAreaWidth = (box.widthPercent / 100) * canvasWidth;
    const targetAreaHeight = (box.heightPercent / 100) * canvasHeight;

    // Aspect ratio preservation lock
    const originalWidth = logoAsset.width || 200;
    const originalHeight = logoAsset.height || 100;
    const originalAspect = originalWidth / originalHeight;

    let finalWidth = targetAreaWidth;
    let finalHeight = finalWidth / originalAspect;

    if (finalHeight > targetAreaHeight) {
      finalHeight = targetAreaHeight;
      finalWidth = finalHeight * originalAspect;
    }

    const x = (box.xPercent / 100) * canvasWidth;
    const y = (box.yPercent / 100) * canvasHeight;

    const instructions = `[DETERMINISTIC_LOGO_OVERLAY] Render vector logo asset at x=${Math.round(x)}px, y=${Math.round(y)}px, width=${Math.round(finalWidth)}px, height=${Math.round(finalHeight)}px with 100% vector sharpness and zero AI deformation.`;

    return {
      success: true,
      logoPlaced: true,
      logoDimensions: {
        width: Math.round(finalWidth),
        height: Math.round(finalHeight),
        x: Math.round(x),
        y: Math.round(y),
      },
      overlayInstructions: instructions,
    };
  }
}
