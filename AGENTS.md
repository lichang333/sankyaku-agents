# Sankyaku Agents

This is an independent local derivative of lichang333/sankyaku-kanban at 49a97ca073ce2e6156dc05c2fb66200bae48986e. Preserve upstream attribution.

- Keep the existing board/card workflows intact. Collaboration is a separate identity and permission layer.
- Never treat an agent as a human user or use a human session cookie for agent API authentication.
- Agent messages do not authorize model calls, shell execution, repository writes, or deployment.
- All database tests use disposable data. Do not touch production services or credentials.
- Native subagents are read-only planners/reviewers during /auto. Implementation uses the guarded agy worker.
- Check npm test, TypeScript, production build, and Python CLI tests before completing a feature.
