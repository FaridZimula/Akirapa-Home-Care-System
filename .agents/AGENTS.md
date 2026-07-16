# Workspace Agent Rules

## Browser Subagent Constraint
- **CRITICAL**: Do NOT use the browser subagent (`browser_subagent`) tool under any circumstances unless the user explicitly requests or commands its use.
- Prefer faster, programmatic alternatives such as command execution, filesystem access, API requests (`read_url_content`), and normal search tools to accomplish tasks.
