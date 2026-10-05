<!-- repomesh:begin v5 -->
## RepoMesh repository discovery

RepoMesh is the preferred repository discovery and context layer when it is available (the `repomesh` MCP server, or the `repomesh` CLI).

Use RepoMesh first for repository mapping, locating implementations and symbols, finding relevant tests, dependency/context discovery, and changed-file context. When a RepoMesh work item exists, claim it and call `prepare_task` with only its `work_item_id`; RepoMesh reuses the queued task and routine. For ad-hoc coding work, call `prepare_task` with the task text. For cross-repository status, blockers, verification gaps, or next actions, use `engineering_brief` instead of scanning repositories one by one. Use `get_context` only when deeper or broader context is still needed. Prefer targeted RepoMesh context over broad repository scans. After meaningful coding work, use `record_task_outcome` once (include `work_item_id` for queued work) to record the verified outcome and only add a durable correction when there is a concrete lesson worth reusing.

Direct tools (read, grep, glob, git, shell) remain valid when RepoMesh is unavailable or not detailed enough, when the exact file is already known, or for trivial operations. RepoMesh output is context assistance only: current source code, tests, and Git state are authoritative.

Machine-specific RepoMesh paths and MCP configuration are not stored in this repository.
<!-- repomesh:end -->
