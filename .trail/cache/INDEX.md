# trail — repo map

Small markdown nodes summarising this repo. `grep` any term, symbol, or
filename here, or run `trail ask "<task>"`. Each node carries prose plus exact
`file:line`; open a source file only to edit the named span.

The same graph is queryable as MCP tools (`trail_find_code`, `trail_find_all`,
`trail_trace_calls`, `trail_file_api`, `trail_repo_map`) where a host exposes them, and
as the `trail` CLI everywhere else. Edges — who calls what — live only in the
graph, not in these files: `trail callers <symbol>` is the only way to read them.

## Files

659 per-file wiring cards mirror the source tree under `graft/` (646 carry extracted symbols). They are deliberately not enumerated here —
`grep` a symbol or `find`/`ls` a filename under `graft/` to land on the card for that file.
