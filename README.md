# Compute Compass

An offline AI hardware planner for personal computers, hybrid setups, worker fleets, professional workstations, servers and rack-scale systems.

## Open it

Download the [standalone app](https://github.com/SpacelyDigital/compute-compass/raw/refs/heads/main/Compute%20Compass.html), or the [complete bundle](https://github.com/SpacelyDigital/compute-compass/raw/refs/heads/main/Compute%20Compass%20Bundle.zip) with source and documentation. Save the HTML file and open it locally; GitHub's file viewer does not run the app.

Double-click **Compute Compass.html** and open it in a current desktop browser such as Chrome, Brave, Edge, Firefox or Safari. Keep or copy this one file wherever you want. No account, installation, AI model, API key or internet connection is required to calculate a plan.

The local development preview is at `http://127.0.0.1:8873/` while its preview server is running. The standalone HTML does not need that server.

## Use it

1. Select your workloads, or start with a preset. There are 26 choices.
2. Set your new-hardware budget, from $0 to $5 million USD.
3. Choose project scale and whether models take turns or remain loaded. Advanced settings expose weight precision, model size, context, training size and sharding.
4. Read parallel capacity as an output. The app estimates each workload's memory-based ceiling on the recommended hardware, with other workloads retained at baseline. These independent peaks cannot be added together and do not establish response speed.
5. Read the required facility in the recommendation. Home, equipment-room and data-center hardware are all considered; location is no longer an input or hidden gate.
6. Add existing devices, including custom profiles. Their purchase cost is zero; their GPU memory never becomes an automatic shared pool.
7. A red result means no full fit under your constraints. It lists blockers first and grays out the partial hardware. **Find a full-fit configuration** checks the current budget, then searches up to $5 million while preserving model and software choices. Any proposed budget change stays separate until you apply it. This is a found fit, not a proof of global optimality.
8. Use **Save this plan** for a readable report. Use **Save choices** to transfer settings, then **Load choices** on another computer. Both exports have a copyable on-screen fallback for embedded browsers that block downloads.

The hardware library contains 45 sourced profiles. It includes consumer GPUs, Macs, DGX Spark/GX10, professional GPUs, dual-GPU workstations, L40S and H200 servers, eight-GPU systems, GB200/GB300 racks and AMD Instinct systems. It is a representative catalog, not every vendor configuration. Two cloud-only platforms are documented but excluded from owned-offline recommendations.

You can enter a newer complete-system price range in each hardware card. This changes price only, not specifications or availability. Do not enter a GPU-only price for a complete computer.

## What the answer means

The app is a deterministic planning tool, not a benchmark or a guarantee of the mathematically optimal purchase. It checks memory, initial SSD space, acquisition estimates and backend conditions, then reports facility needs. It searches individual machines, pairs, homogeneous fleets and mixed per-workload packages, up to 128 new nodes. The baseline fits one instance of each selected model family under your chosen residency mode. More budget alone does not create a demand for more replicas.

The following remain separate:

- Model weights fitting in memory.
- Enough memory-admission slots for concurrent requests.
- Software support for the exact model and runtime.
- Measured response latency, tokens per second or video completion time.
- Actual output quality.

The app never claims the last three are established by RAM arithmetic. A larger GPU or budget does not guarantee a better video or more accurate reasoning.

All workload envelopes and whole-system price bands are labeled planning assumptions. The bundled hardware/source snapshot is dated **September 20, 2026**. Prices are USD before tax, shipping, support upgrades, external storage, networking, facility construction and installation. Enterprise configurations require quotes. Offline data cannot track later changes.

The optional managed-service setting restricts new text-serving hardware to professional multi-GPU workstations or servers. The default accepts any suitable hardware. Managed services also need routing, admission controls, monitoring, security, failover and operational ownership.

Legacy saved location, request-count and worker-count fields are discarded on load. They cannot silently constrain the new planner. Capacity probes grow one workload at a time using only the chosen hardware; the search bounds are 10,000 text requests and 128 media copies. A result that reaches the bound is labeled “at least.” Full-workload capacity is unavailable while a model family or initial storage is missing.

## Memory rules

- Inference weight size uses total parameters and the selected precision. MoE active-parameter count does not replace total weight storage.
- Every replica repeats weights/runtime and receives its own request cache. Replicas are distinct from sharding.
- LLM cache is an architecture-dependent illustrative allowance, not an exact measurement.
- Media families use visible scenario allowances. Different audio tasks and image editing are counted separately.
- Resident mode keeps model families loaded. All text request caches count together; media families take turns while copies of the active family can run concurrently. Peak-capacity outputs vary one family at a time, not every family simultaneously.
- GPU memory is checked per device. Host RAM is accounted once per machine/domain. Unified memory must satisfy both its GPU planning budget and host floor within the same physical pool.
- Sharding is opt-in and conditional on compatible distributed software. It stays inside a declared GPU fabric: one server, or the NVL72 rack domain. Separate systems are not combined. LLM sharding conservatively repeats full request cache on each shard rather than assuming cache partitioning.
- The MI355X rack is eight eight-GPU nodes, not one transparent 64-GPU memory allocation.
- Fine-tuning models a language-model adapter workflow. Full training uses a separate optimizer/gradient memory calculation and training target size. Training duration and datasets are not sized.

## Privacy and offline behavior

The HTML embeds its catalog, styles, engine and interface. There are no external script, font or stylesheet dependencies, analytics, background requests or API calls. Its content security policy blocks network connections. Larger calculations run in an embedded worker, with a same-page fallback where workers are unavailable.

Choices stay in browser local storage when permitted. Export/import files work without an account. Source links require internet only if you choose to open them. The app does not include or download the recommended models, runtimes or dependencies.

Optional WebMCP tools mirror the visible read/configure/full-fit-comparison actions in browsers that support them. They are not required for any feature, and they do not contact an AI provider.

Browser agents you grant access to these optional tools can read your current choices, owned-hardware entries and plan. Those agents' handling of that information is outside this app. The app itself makes no network requests.

## Source and maintenance

- `src/catalog.json`: hardware profiles, use cases and source references.
- `src/engine.js`: deterministic capacity, placement, fleet and ranking rules.
- `src/app.js`: interface, persistence, portable reports and optional tools.
- `src/index.html`, `src/styles.css`: layout and styling.
- `build.mjs`: generates the standalone HTML and `dist/index.html`.
- `tests/engine.test.cjs`: automated regression suite.

No dependencies need installing. With Node.js available:

```sh
npm run build
npm test
```

The test suite checks zero-budget and owned-device plans, native weights, training targets, host/GPU boundaries, synthetic exact replica arithmetic, fleet expansion, sharding, facility escalation, custom prices, catalog integrity and a self-contained build. See `VALIDATION.md` for verification scope and remaining limits.
