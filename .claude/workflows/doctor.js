export const meta = {
  name: 'doctor',
  description: 'Read-only health check for every repo in the workspace: build, quality, dependencies, security, config, correctness, each finding verified',
  whenToUse: 'Before a release, after a dependency bump, when a deploy breaks, or when a repo has not been touched in a while. Args (all optional): {repos: [absolute paths], focus: [dimension keys]}.',
  phases: [
    { title: 'Discover', detail: 'find repos and profile each stack' },
    { title: 'Examine', detail: 'one agent per repo per dimension' },
    { title: 'Verify', detail: 'three lenses per finding, majority keeps it' },
    { title: 'Critique', detail: 'what the exam could not cover' },
    { title: 'Report', detail: 'one ranked report across all repos' },
  ],
}

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info']
const RANK = Object.fromEntries(SEVERITIES.map((s, i) => [s, i]))

const READ_ONLY = [
  'Rules for this run:',
  '- Do not edit, create, or delete tracked files. Do not commit, push, or open PRs.',
  '- Installing dependencies and writing output into ignored folders (node_modules, dist, .astro, .venv, __pycache__) is allowed.',
  '- Put any scratch files outside the repo.',
  '- If a command fails because of the network proxy or a missing system tool, list it under skipped with the reason. That is an environment gap, not a repo defect.',
].join('\n')

const SEVERITY_GUIDE =
  'Severity: critical = breaks install, build, or deploy, or exposes a secret. high = wrong behavior a user or developer will hit. medium = likely future breakage. low = hygiene. info = worth knowing, no defect.'

const REPOS_SCHEMA = {
  type: 'object',
  properties: { repos: { type: 'array', items: { type: 'string' } } },
  required: ['repos'],
}

const PROFILE_SCHEMA = {
  type: 'object',
  properties: {
    repo: { type: 'string' },
    stack: { type: 'string', description: 'One line, e.g. "Astro 4 site deployed on Netlify" or "Flask API with SQLite"' },
    languages: { type: 'array', items: { type: 'string' } },
    packageManager: { type: 'string' },
    runtimeVersion: { type: 'string', description: 'Pinned Node or Python version and where it is pinned, or "unpinned"' },
    commands: {
      type: 'object',
      properties: {
        install: { type: 'string' },
        lint: { type: 'string' },
        typecheck: { type: 'string' },
        test: { type: 'string' },
        build: { type: 'string' },
        run: { type: 'string' },
      },
      required: ['install', 'lint', 'typecheck', 'test', 'build', 'run'],
      description: 'Exact commands from package.json scripts, Makefile, README, or CI. Empty string when none exists.',
    },
    keyFiles: { type: 'array', items: { type: 'string' }, description: 'Entry points, config, deploy and CI files' },
    notes: { type: 'string' },
  },
  required: ['repo', 'stack', 'languages', 'packageManager', 'runtimeVersion', 'commands', 'keyFiles', 'notes'],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    ran: { type: 'array', items: { type: 'string' }, description: 'Commands run and files read' },
    skipped: { type: 'array', items: { type: 'string' }, description: 'Checks not done, each with the reason' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: SEVERITIES },
          title: { type: 'string' },
          file: { type: 'string', description: 'Repo-relative path, or "(command)" for command output' },
          line: { type: 'integer', description: '0 when no line applies' },
          evidence: { type: 'string', description: 'Exact error output or code excerpt' },
          failure_scenario: { type: 'string' },
          fix: { type: 'string', description: 'Smallest change that resolves it' },
        },
        required: ['severity', 'title', 'file', 'line', 'evidence', 'failure_scenario', 'fix'],
      },
    },
  },
  required: ['ran', 'skipped', 'findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    real: { type: 'boolean' },
    severity: { type: 'string', enum: SEVERITIES },
    reason: { type: 'string' },
  },
  required: ['real', 'severity', 'reason'],
}

const GAPS_SCHEMA = {
  type: 'object',
  properties: {
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          area: { type: 'string' },
          why: { type: 'string' },
          next_check: { type: 'string' },
        },
        required: ['area', 'why', 'next_check'],
      },
    },
  },
  required: ['gaps'],
}

const DIMENSIONS = [
  {
    key: 'build',
    prompt: p =>
      `Install dependencies and build from a clean state. Profile commands: install="${p.commands.install}", build="${p.commands.build}", run="${p.commands.run}". Where a command is empty, use the standard one for the stack. If the app has a run or dev command, start it, confirm it boots, then stop it. Report anything that breaks a fresh clone or a deploy: install errors, build errors, build warnings that will become errors, boot crashes, runtime version mismatches.`,
  },
  {
    key: 'quality',
    prompt: p =>
      `Run lint, typecheck, and tests. Profile commands: lint="${p.commands.lint}", typecheck="${p.commands.typecheck}", test="${p.commands.test}". Where empty, try the standard tool for the stack only if it is already a dependency or config exists for it. Report each failing check with output. A missing test suite on code with real logic is one finding.`,
  },
  {
    key: 'deps',
    prompt: () =>
      'Audit dependencies. Use npm audit and npm outdated for Node, pip list --outdated and pip-audit (install it into a scratch venv if absent) for Python. Check for: known vulnerabilities, unpinned or loosely pinned versions, missing or out-of-sync lockfile, deprecated packages, packages imported but not declared, declared but never imported, and engine or Python version constraints that disagree with config.',
  },
  {
    key: 'security',
    prompt: () =>
      'Look for security defects. Secrets or tokens in tracked files and in git history (git log -p, search for key, token, secret, password, api patterns), committed .env files, SQL or shell or path injection, unsafe eval, pickle, or yaml.load, missing auth on routes that change data, permissive CORS, debug mode left on, user input rendered without escaping. Leave CVEs in dependencies to the deps check.',
  },
  {
    key: 'config',
    prompt: () =>
      'Check deploy, CI, and environment config. Read deploy config (netlify.toml, vercel.json, Dockerfile, Procfile, astro.config), GitHub workflows, .gitignore, .env.example. Compare env vars the code reads against what is documented. Check that README setup steps match the real commands. Check runtime version pinning (.nvmrc, engines, .python-version, runtime.txt). Report mismatches that will break a deploy or a new developer setup.',
  },
  {
    key: 'correctness',
    prompt: () =>
      'Read the core source: entry points, routes, data models, and business logic. Find logic bugs, broken imports, unhandled errors on I/O and network calls, routes or pages that cannot be reached, wrong types at boundaries, off-by-one and date handling errors, and data that is written but never read. Each finding needs a concrete input that produces the wrong result.',
  },
]

const LENSES = [
  {
    key: 'reproduce',
    prompt:
      'Check the evidence yourself on the current tree: open the file at that line or rerun the command. real=false if you cannot reproduce the defect.',
  },
  {
    key: 'impact',
    prompt:
      'Trace a realistic path from a real user, deploy, or developer action to the failure. real=false if the path is far fetched. Set severity to what the impact actually supports.',
  },
  {
    key: 'refute',
    prompt:
      'Argue against this finding. Look for a guard, config, or context that makes it a non issue: handled elsewhere, intended, dev only, already ignored, dead code. Default to real=false if uncertain.',
  },
]

function dedupKey(f) {
  const file = (f.file || '').trim().toLowerCase()
  return f.line > 0 ? `${file}:${f.line}` : `${file}:${(f.title || '').trim().toLowerCase()}`
}

function bySeverity(a, b) {
  return RANK[a.severity] - RANK[b.severity]
}

// ---------- Discover ----------

phase('Discover')

let repos = Array.isArray(args?.repos) && args.repos.length ? args.repos : null
if (!repos) {
  const found = await agent(
    'List the absolute paths of every git repository at the current working directory or one level below it (directories that contain a .git folder). Return them in repos.',
    { label: 'discover-repos', phase: 'Discover', schema: REPOS_SCHEMA, effort: 'low' },
  )
  repos = found?.repos ?? []
}
if (!repos.length) return { report: 'Doctor found no git repositories to examine.', results: [] }
log(`Examining ${repos.length} repo(s): ${repos.join(', ')}`)

const dims = Array.isArray(args?.focus) && args.focus.length
  ? DIMENSIONS.filter(d => args.focus.includes(d.key))
  : DIMENSIONS
if (dims.length < DIMENSIONS.length) {
  log(`Focus set. Skipping dimensions: ${DIMENSIONS.filter(d => !dims.includes(d)).map(d => d.key).join(', ')}`)
}

// ---------- Per-repo pipeline: profile -> examine -> verify -> critique ----------

const results = await pipeline(
  repos,

  // Profile the stack so every finder works from the same commands.
  repo =>
    agent(
      `Profile the repository at ${repo} for a health check. Read package.json, requirements.txt, pyproject.toml, Makefile, README, CI workflows, and deploy config. Record the exact install, lint, typecheck, test, build, and run commands (empty string when none exists), the runtime version and where it is pinned, and the key files. Read only. Do not run anything that changes files.`,
      { label: `profile:${repo.split('/').pop()}`, phase: 'Discover', schema: PROFILE_SCHEMA },
    ).then(p => {
      if (!p) throw new Error(`profile failed for ${repo}`)
      return { ...p, repo }
    }),

  // One finder per dimension. Barrier inside the repo so findings can be deduped before verify.
  async (profile, repo) => {
    const name = repo.split('/').pop()
    const exams = await parallel(dims.map(d => () =>
      agent(
        [
          `You are examining the repository at ${repo} for the "${d.key}" part of a health check.`,
          `Stack profile: ${JSON.stringify(profile)}`,
          '',
          d.prompt(profile),
          '',
          READ_ONLY,
          '',
          'Report only defects you observed in this repo, backed by command output or a file and line. No style opinions and no generic advice.',
          SEVERITY_GUIDE,
          'Return an empty findings list if this part is clean. Always fill ran and skipped.',
        ].join('\n'),
        { label: `${d.key}:${name}`, phase: 'Examine', schema: FINDINGS_SCHEMA },
      ).then(r => (r ? { dimension: d.key, ...r } : { dimension: d.key, ran: [], skipped: ['agent did not return'], findings: [] })),
    ))

    const seen = new Map()
    for (const exam of exams.filter(Boolean)) {
      for (const f of exam.findings) {
        const k = dedupKey(f)
        const prev = seen.get(k)
        if (!prev || RANK[f.severity] < RANK[prev.severity]) seen.set(k, { ...f, dimension: exam.dimension })
      }
    }
    const findings = [...seen.values()].sort(bySeverity)
    const raw = exams.filter(Boolean).reduce((n, e) => n + e.findings.length, 0)
    log(`${name}: ${raw} raw finding(s), ${findings.length} after dedup`)
    return { profile, exams: exams.filter(Boolean), findings }
  },

  // Three lenses per finding. Keep it when a majority of returned votes say real.
  async (state, repo) => {
    const name = repo.split('/').pop()
    const judged = await parallel(state.findings.map((f, i) => () =>
      parallel(LENSES.map(lens => () =>
        agent(
          [
            `Verify this health-check finding in the repository at ${repo}.`,
            `Finding: ${JSON.stringify(f)}`,
            '',
            `Lens: ${lens.key}. ${lens.prompt}`,
            '',
            READ_ONLY,
            SEVERITY_GUIDE,
          ].join('\n'),
          { label: `${lens.key}:${name}#${i + 1}`, phase: 'Verify', schema: VERDICT_SCHEMA, effort: lens.key === 'reproduce' ? 'medium' : undefined },
        ),
      )).then(votes => {
        const v = votes.filter(Boolean)
        const yes = v.filter(x => x.real)
        const keep = v.length >= 2 && yes.length * 2 > v.length
        const ranks = yes.map(x => RANK[x.severity]).sort((a, b) => a - b)
        const severity = ranks.length ? SEVERITIES[ranks[Math.floor(ranks.length / 2)]] : f.severity
        return { ...f, severity, keep, votes: v.map(x => ({ real: x.real, reason: x.reason })) }
      }),
    ))
    const confirmed = judged.filter(Boolean).filter(f => f.keep).sort(bySeverity)
    const rejected = judged.filter(Boolean).filter(f => !f.keep)
    log(`${name}: ${confirmed.length} confirmed, ${rejected.length} rejected`)
    return { ...state, confirmed, rejected }
  },

  // One critic pass per repo. Single round: gaps go in the report, they are not re-examined.
  async (state, repo) => {
    const critique = await agent(
      [
        `A health check just ran on the repository at ${repo}. Find what it did not cover.`,
        `Profile: ${JSON.stringify(state.profile)}`,
        `What each part ran and skipped: ${JSON.stringify(state.exams.map(e => ({ dimension: e.dimension, ran: e.ran, skipped: e.skipped })))}`,
        `Confirmed findings: ${JSON.stringify(state.confirmed.map(f => f.title))}`,
        '',
        'Look for: checks skipped or blocked by an earlier failure, key files never read, commands from the profile never run, parts of the stack no dimension touched. Each gap gets the reason and the one next check that would close it. Read the repo if you need to. Do not change files.',
      ].join('\n'),
      { label: `critic:${repo.split('/').pop()}`, phase: 'Critique', schema: GAPS_SCHEMA },
    )
    return { ...state, gaps: critique?.gaps ?? [] }
  },
)

const done = results.filter(Boolean)
const dropped = repos.filter((r, i) => !results[i])
if (dropped.length) log(`Dropped (profile or a stage failed): ${dropped.join(', ')}`)
log('Critic ran one round. Its gaps are listed in the report, not re-examined.')

// ---------- Report (needs every repo at once) ----------

phase('Report')

const summary = done.map(s => ({
  repo: s.profile.repo,
  stack: s.profile.stack,
  dimensions: s.exams.map(e => ({ dimension: e.dimension, ran: e.ran, skipped: e.skipped })),
  confirmed: s.confirmed.map(({ keep, votes, ...f }) => f),
  rejected: s.rejected.map(f => ({ title: f.title, file: f.file, why: f.votes.map(v => v.reason) })),
  gaps: s.gaps,
}))

const report = await agent(
  [
    'Write the health report for this doctor run as Markdown.',
    `Data: ${JSON.stringify({ repos: summary, dropped })}`,
    '',
    'Structure:',
    '1. First five fixes across all repos, most severe first, each as repo, file:line, and the fix in one line.',
    '2. Per repo: the stack in one line, a table with one row per dimension (dimension, status pass, warn, or fail, one-line reason), then confirmed findings grouped by severity with file:line, what breaks, and the fix.',
    '3. Per repo: gaps the check could not cover and the next check for each.',
    '4. One line counting rejected findings per repo. Do not list them.',
    '5. Any dropped repos and why.',
    '',
    'Use only the data given. Do not invent findings. Plain, direct language. Active voice. No em dashes, no contractions, no semicolons.',
  ].join('\n'),
  { label: 'report', phase: 'Report' },
)

return { report, results: summary, dropped }
