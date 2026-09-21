# Validation record

Catalog snapshot: September 20, 2026. This record describes software checks, not physical GPU benchmarks.

## Automated checks

46 regression tests pass with Node.js. Run `npm test` to repeat them. The suite covers:

- Catalog counts, unique IDs, official-source URL shapes and valid price ranges.
- Empty selections, zero budget, owned devices and insufficient SSD space.
- Upper-price overruns, native weight arithmetic and independent training sizes.
- Explicit replica requests rather than one giant multiplied model.
- Shared host memory, unified memory, edited GPU capacities and no inter-machine VRAM pooling.
- Simultaneous request caches and parallel media copies.
- Constraint-aware placement using a Mac for text and CUDA for a constrained 3D task.
- A hand-calculated synthetic case: 1,000 memory-admission slots require nine four-GPU servers at 28 slots per replica; eight servers admit 896.
- Fleet expansion with owned nodes, including the exact two-new-node boundary.
- Intermediate four-GPU shard groups and the expert-mode regression.
- A 1,000-request native-70B plan across multiple actual catalog server profiles.
- MI355X rack sharding boundaries, facility escalation and a large budget not automatically causing a rack purchase.
- Custom devices/prices, input bounds, slider monotonicity, deterministic results and self-contained build syntax.

The low-level demand-based allocator retains its regression tests, but demand counts and location are no longer public planner inputs. New tests cover legacy-choice migration, explicit research-training blockers, derived facilities, fixed-hardware capacity, separate family peaks, search-bound labels, budget/storage failures and non-mutating full-fit comparisons. The comparison cannot claim success above the $5 million upper-price ceiling or silently enable distributed software.

An independent read-only review checked 11 new boundary cases and 60 reported capacity ceilings across 15 workload scenarios. Each ceiling had a feasible witness placement; the next count failed unless the search bound was reached. A ten-device fleet remained intact. Earlier allocation review covered another 30 scenarios.

## Live interface checks

Verified in the local Codex browser preview:

- Retained workload choices survive reload; removed demand and location constraints are discarded.
- Research-scale 400B training with distributed software disabled produces a red headline, explicit multi-GPU blockers, gray partial hardware and unavailable whole-workload capacity.
- The full-fit button searches separately without changing current model settings. Failure remains explicit even at the search budget ceiling.
- A zero-budget text test proposes a separate $700–$1,800 CPU candidate, leaves the budget unchanged until the apply button is clicked, then changes only the budget to $1,800. CPU speed remains unbenchmarked and explicitly cautioned.
- The hardware library's server filter includes mid-tier L40S/H200 and larger DGX/Instinct systems.
- Budget slider has a dollar-denominated accessible value.
- Report dialog displays a full report containing fleet counts, budget, warnings and unbenchmarked-performance status.
- Loading the supplied hybrid JSON creates the three existing devices and produces a $0-new-hardware candidate for its smaller selected workload assumptions.
- Optional WebMCP read/configure/comparison tools register and use the same visible state. Deprecated location/request/worker inputs are no longer exposed.
- The comparison tool was exercised successfully; the configure tool rejected the removed `users` input without changing settings.
- No unexpected application error/warning messages were observed in the browser log checks.

## Offline and browser verification boundaries

The build embeds all scripts, CSS and catalog data. It has no external runtime assets or network API calls, and its content security policy blocks network connections. Those properties are covered by automated checks. The app does not depend on the local preview server when opened as a standalone file in an ordinary browser.

The automation browser's URL policy refused a direct `file://` navigation. No workaround was attempted. Therefore direct-file/airplane-mode behavior was not browser-automated here. The code catches unavailable local storage and falls back if embedded workers cannot start.

The browser's download-event check timed out. Rather than claim a confirmed saved download, the app provides a visible report/choices dialog with copy and download options and accurate feedback. Standard-browser download behavior remains a separate acceptance check.

A requested narrow viewport override did not take effect in this browser: the measured viewport stayed 954px wide. The desktop layout was visually inspected with no page-width overflow. Responsive CSS and the mobile result link are implemented, but actual 390px rendering was not verified in this environment.

## Not established by these tests

No recommended GPU, server or rack was physically benchmarked by this application build. Exact models, precision, duration, context architecture, runtime versions, power consumption, thermal design, token speed, image/video quality, service latency, failure recovery and installed enterprise pricing all require further validation before procurement. The search is bounded and heuristic; passing tests is not proof of global optimality.
