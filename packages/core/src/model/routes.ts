import { Schema } from "effect"

/** Every `Role.task` specialist the plugin ships. */
export const Role = Schema.Literals([
  "Explorer.map",
  "Explorer.lookup",
  "Explorer.trace",
  "Librarian.lookup",
  "Librarian.research",
  "Worker.mechanical",
  "Worker.implementation",
  "Worker.integration",
  "Worker.operations",
  "Worker.validation",
  "Worker.debugging",
  "Worker.visual",
  "Reviewer.code",
  "Reviewer.testing",
  "Reviewer.audit",
  "Reviewer.security",
  "Reviewer.artifact",
  "Reviewer.visual",
])
/** A `Role.task` specialist name. */
export type Role = typeof Role.Type

/** What an Assignment may change: nothing, or only its declared ownership paths. */
export const Mutability = Schema.Literals(["ReadOnly", "ScopedWrite"])
/** Whether an Assignment may write. */
export type Mutability = typeof Mutability.Type

/** Capabilities a route needs from its worker. */
export const Capability = Schema.Literals(["Search", "Shell", "VisualInspection", "Write"])
/** One capability a worker holds. */
export type Capability = typeof Capability.Type

/** How a route relates to other work: the invariant the root follows when dispatching it. */
export const Independence = Schema.Literals([
  "DisjointWrites",
  "DependenciesTerminal",
  "IndependentReview",
])
/** The independence invariant of a route. */
export type Independence = typeof Independence.Type

/** Model alias pinned by a specialist. */
export const Model = Schema.Literals(["haiku", "sonnet"])
/** A pinned model alias. */
export type Model = typeof Model.Type

/** Reasoning effort pinned by a specialist. Low and max are deliberately absent. */
export const Effort = Schema.Literals(["medium", "high", "xhigh"])
/** A pinned reasoning effort. */
export type Effort = typeof Effort.Type

/** Everything the runtime enforces about one specialist. */
export interface Route {
  readonly role: Role
  /** The plugin agent name, derived from the role. */
  readonly agent: string
  /** The most an Assignment dispatched to this route may be allowed to change. */
  readonly mutability: Mutability
  readonly capabilities: ReadonlyArray<Capability>
  readonly independence: Independence
  readonly model: Model
  readonly effort: Effort
}

type Spec = Omit<Route, "role" | "agent">

const spec = (
  mutability: Mutability,
  capabilities: ReadonlyArray<Capability>,
  independence: Independence,
  model: Model,
  effort: Effort,
): Spec => ({ mutability, capabilities, independence, model, effort })

const SPECS: Readonly<Record<Role, Spec>> = {
  "Explorer.map": spec("ReadOnly", [], "DisjointWrites", "haiku", "medium"),
  "Explorer.lookup": spec("ReadOnly", [], "DisjointWrites", "haiku", "medium"),
  "Explorer.trace": spec("ReadOnly", [], "DependenciesTerminal", "sonnet", "medium"),
  "Librarian.lookup": spec("ReadOnly", ["Search"], "DisjointWrites", "haiku", "medium"),
  "Librarian.research": spec("ReadOnly", ["Search"], "DependenciesTerminal", "sonnet", "medium"),
  "Worker.mechanical": spec("ScopedWrite", ["Write"], "DisjointWrites", "haiku", "high"),
  "Worker.implementation": spec("ScopedWrite", ["Write"], "DisjointWrites", "sonnet", "high"),
  "Worker.integration": spec("ScopedWrite", ["Write"], "DependenciesTerminal", "sonnet", "high"),
  "Worker.operations": spec("ScopedWrite", ["Shell"], "DisjointWrites", "haiku", "high"),
  "Worker.validation": spec("ReadOnly", ["Shell"], "DependenciesTerminal", "haiku", "high"),
  "Worker.debugging": spec("ScopedWrite", ["Write"], "DependenciesTerminal", "sonnet", "high"),
  "Worker.visual": spec(
    "ScopedWrite",
    ["Write", "VisualInspection"],
    "DisjointWrites",
    "sonnet",
    "high",
  ),
  "Reviewer.code": spec("ReadOnly", [], "IndependentReview", "sonnet", "high"),
  "Reviewer.testing": spec("ReadOnly", ["Shell"], "IndependentReview", "sonnet", "medium"),
  "Reviewer.audit": spec("ReadOnly", [], "IndependentReview", "haiku", "high"),
  "Reviewer.security": spec("ReadOnly", [], "IndependentReview", "sonnet", "high"),
  "Reviewer.artifact": spec("ReadOnly", [], "IndependentReview", "haiku", "high"),
  "Reviewer.visual": spec("ReadOnly", ["VisualInspection"], "IndependentReview", "sonnet", "high"),
}

/** Looks up the route of a role. */
export const routeFor = (role: Role): Route => ({
  role,
  agent: role.toLowerCase().replace(".", "-"),
  ...SPECS[role],
})

/** The 18 specialists, in the order the plugin documents them. */
export const ROUTES: ReadonlyArray<Route> = Role.literals.map(routeFor)
