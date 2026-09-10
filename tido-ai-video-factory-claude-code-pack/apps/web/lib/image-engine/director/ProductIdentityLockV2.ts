import { DirectorBrief, ProductIdentityLockV2 } from "./creative-director.types";

/**
 * CIOS Phase 4.1 Task 5 — what must not change.
 *
 * The rule
 * -------
 * Never redesign the product. Everything about how it is *photographed* is the
 * director's to choose; nothing about what it *is* ever is. The existing prompt
 * already draws that line, and this layer makes the protected side explicit
 * attribute by attribute rather than as one paragraph of prose.
 *
 * Why seven named attributes rather than a paragraph
 * -------------------------------------------------
 * A paragraph saying "preserve the product exactly" is unfalsifiable and
 * unhelpful — it gives a renderer no list to check itself against, and it gives
 * us no way to know what we failed to specify. Seven named attributes do both:
 * shape, colour, logo position, material, texture and unique features, each
 * either evidenced or explicitly unknown.
 *
 * The unknowns matter more than the knowns
 * ---------------------------------------
 * Where a brief has no reference image, most attributes have no evidence. The
 * honest response is to say so, not to invent a plausible material. An invented
 * attribute is worse than a missing one: a missing attribute leaves the renderer
 * free to follow the reference image, while an invented one actively instructs
 * it to contradict the reference. So `unknown` is populated deliberately and the
 * lock statement tells the renderer to defer to the reference for those, rather
 * than pretending to knowledge this layer does not have.
 */

export class ProductIdentityLockBuilder {
  public static build(brief: DirectorBrief, productId = "PRODUCT_01"): ProductIdentityLockV2 {
    const ref = brief.reference_attributes || {};
    const unknown: string[] = [];
    let evidenced = 0;
    const total = 6;

    const shape = this.resolve(ref.shape, () => this.inferShape(brief), "shape", unknown, () => evidenced++);
    const color = this.resolve(ref.color, () => this.inferColor(brief), "color", unknown, () => evidenced++);
    const logo_position = this.resolve(
      ref.logo_position,
      () => "",
      "logo_position",
      unknown,
      () => evidenced++
    );
    const material = this.resolve(ref.material, () => this.inferMaterial(brief), "material", unknown, () => evidenced++);
    const texture = this.resolve(ref.texture, () => "", "texture", unknown, () => evidenced++);

    const unique_features = ref.unique_features && ref.unique_features.length ? [...ref.unique_features] : [];
    if (unique_features.length) evidenced++;
    else unknown.push("unique_features");

    const lock_statement = this.statement(brief, productId, {
      shape,
      color,
      logo_position,
      material,
      texture,
      unique_features,
      unknown,
    });

    return {
      product_id: productId,
      name: brief.product,
      shape,
      color,
      logo_position,
      material,
      texture,
      unique_features,
      lock_statement,
      unknown,
      evidence: Number((evidenced / total).toFixed(2)),
    };
  }

  /**
   * An attribute, from evidence where there is any.
   *
   * An inference is used only where it is safe — a category-level guess about
   * form ("a bottle is a bottle") does not contradict a reference image. Where
   * no safe inference exists the attribute is recorded as unknown, which is what
   * puts it into the "defer to the reference" clause of the lock statement.
   */
  private static resolve(
    evidenced: string | undefined,
    infer: () => string,
    name: string,
    unknown: string[],
    countEvidence: () => void
  ): string {
    const fromRef = String(evidenced || "").trim();
    if (fromRef) {
      countEvidence();
      return fromRef;
    }
    const inferred = infer();
    if (inferred) return inferred;
    unknown.push(name);
    return "";
  }

  private static inferShape(brief: DirectorBrief): string {
    const p = `${brief.product} ${brief.category}`.toLowerCase();
    if (/\bbottle|drink|beverage|juice|water|soda|brew\b/.test(p)) return "bottle form as shown in the reference — silhouette, shoulder and neck proportions exactly as supplied";
    if (/\bcan\b/.test(p)) return "can form as shown in the reference — diameter to height ratio exactly as supplied";
    if (/\bjar|pot\b/.test(p)) return "jar form as shown in the reference — body and lid proportions exactly as supplied";
    if (/\btube|cream|serum|lotion\b/.test(p)) return "tube form as shown in the reference — taper and cap proportions exactly as supplied";
    if (/\bbox|pack|carton|sachet\b/.test(p)) return "carton form as shown in the reference — face proportions and edge geometry exactly as supplied";
    return "";
  }

  private static inferColor(brief: DirectorBrief): string {
    // Only from the brief's own words. Guessing a brand colour is redesigning.
    const m = brief.brief_text.match(
      /\b(red|blue|green|black|white|gold|silver|amber|pink|purple|orange|yellow|brown|cream|navy|teal)\b/i
    );
    return m ? `${m[1].toLowerCase()} as stated in the brief, matched to the reference exactly` : "";
  }

  private static inferMaterial(brief: DirectorBrief): string {
    const p = `${brief.product} ${brief.category} ${brief.brief_text}`.toLowerCase();
    if (/\bglass\b/.test(p)) return "glass — transmissive, with refraction through the body and true specular highlights";
    if (/\baluminium|aluminum|can|metal|steel\b/.test(p)) return "metal — anisotropic specular response, no diffuse plastic sheen";
    if (/\bplastic|pet\b/.test(p)) return "moulded plastic — even diffuse surface with soft speculars";
    if (/\bpaper|carton|card\b/.test(p)) return "coated board — matte with a slight surface tooth";
    return "";
  }

  /**
   * The lock, as one instruction block.
   *
   * Ordered protected-then-free, because the renderer needs to know what it may
   * not touch before it is told what it may. The final clause is the important
   * one: for everything unknown, the reference image is the authority, not this
   * text and not the model's prior about what such a product usually looks like.
   */
  private static statement(
    brief: DirectorBrief,
    productId: string,
    a: {
      shape: string;
      color: string;
      logo_position: string;
      material: string;
      texture: string;
      unique_features: string[];
      unknown: string[];
    }
  ): string {
    const lines: string[] = [
      `[PRODUCT IDENTITY LOCK — ${productId}] ${brief.product}`,
      "PROTECTED — reproduce exactly, never redesign, never restyle, never improve:",
    ];
    if (a.shape) lines.push(`- Shape: ${a.shape}`);
    if (a.color) lines.push(`- Colour: ${a.color}`);
    if (a.logo_position) lines.push(`- Logo position: ${a.logo_position}`);
    if (a.material) lines.push(`- Material: ${a.material}`);
    if (a.texture) lines.push(`- Texture: ${a.texture}`);
    if (a.unique_features.length) lines.push(`- Unique features: ${a.unique_features.join("; ")}`);
    lines.push(
      "- Proportions, structural geometry, branding, label typography and packaging construction are fixed and are not design decisions available in this pass."
    );

    lines.push(
      "FREE — these are photographic choices and may be directed:",
      "- Camera angle, lens, framing and distance; lighting; background and environment; colour grade; depth of field."
    );

    if (a.unknown.length) {
      lines.push(
        `UNSPECIFIED — ${a.unknown.join(", ")} are not described here because no evidence was supplied. ` +
          "For these, the reference image is the sole authority: reproduce what it shows and invent nothing. " +
          "Do not substitute a typical example of this product type."
      );
    }
    return lines.join("\n");
  }
}
