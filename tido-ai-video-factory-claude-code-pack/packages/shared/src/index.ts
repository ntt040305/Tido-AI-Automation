/**
 * @tido/shared — the vocabulary both layers agree on.
 *
 * This package has NO runtime dependencies, and that is the point rather than
 * an accident. It holds the row shapes, the repository interfaces and the
 * handful of constants that the application and the infrastructure both need
 * to name. Because it depends on nothing, importing it can never drag a
 * database driver or an auth SDK into a bundle that had no business holding
 * one.
 *
 * The direction of dependency is what makes the separation real:
 *
 *   apps/web            ->  @tido/shared   (interfaces)
 *   @tido/infrastructure ->  @tido/shared   (implements them)
 *
 * The application depends on the contract, not on the thing that satisfies it.
 * Swapping Supabase for anything else is then a new implementation of these
 * interfaces, with no edit in the application at all.
 */

export * from "./types/results";
export * from "./types/identity";
export * from "./types/database";
export * from "./constants/roles";
export * from "./contracts/repositories";
export * from "./contracts/storage";
