import { GOLD, GRAY, RESET } from '../output/format.js';

export async function runCompletions(shell?: string): Promise<void> {
  const COMMANDS = [
    'open',
    'validate',
    'status',
    'doctor',
    'agents',
    'teams',
    'session',
    'metrics',
    'benchmark',
    'screenshots',
    'demo',
    'config',
    'models',
    'provider',
    'plans',
    'projects',
    'completions',
    'help',
  ];
  const DOCTOR_SUBS = ['audio', 'conversation', 'agents', 'teams', 'models'];
  const TEAMS_SUBS = ['create', 'assign', 'list'];
  const SESSION_SUBS = ['workflows', 'start', 'list', 'background'];
  const CONFIG_SUBS = ['get', 'set', 'reset'];
  const PROVIDER_SUBS = ['list', 'status'];
  const BENCHMARK_SUBS = ['conversation'];
  const DEMO_SUBS = ['golden-path'];
  const SCREENSHOT_SUBS = ['run', 'update', 'report', 'clean', 'check'];
  const D = '$';

  if (!shell || shell === 'bash') {
    console.log(`# Vestara CLI bash completion
# Source: source <(vestara completions bash)
_vestara_completions() {
  local cur=${D}{COMP_WORDS[COMP_CWORD]}
  local prev=${D}{COMP_WORDS[COMP_CWORD-1]}
  if [ COMP_CWORD -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${COMMANDS.join(' ')} --help --version -h -v --watch -w" -- "${D}cur") )
    return 0
  fi
  case "${D}{COMP_WORDS[1]}" in
    doctor)    COMPREPLY=( $(compgen -W "${DOCTOR_SUBS.join(' ')}" -- "${D}cur") ) ;;
    teams)     COMPREPLY=( $(compgen -W "${TEAMS_SUBS.join(' ')}" -- "${D}cur") ) ;;
    session)   COMPREPLY=( $(compgen -W "${SESSION_SUBS.join(' ')}" -- "${D}cur") ) ;;
    config)    COMPREPLY=( $(compgen -W "${CONFIG_SUBS.join(' ')}" -- "${D}cur") ) ;;
    provider)  COMPREPLY=( $(compgen -W "${PROVIDER_SUBS.join(' ')}" -- "${D}cur") ) ;;
    benchmark) COMPREPLY=( $(compgen -W "${BENCHMARK_SUBS.join(' ')}" -- "${D}cur") ) ;;
    demo)      COMPREPLY=( $(compgen -W "${DEMO_SUBS.join(' ')}" -- "${D}cur") ) ;;
    screenshots) COMPREPLY=( $(compgen -W "${SCREENSHOT_SUBS.join(' ')} --viewport --theme --routes --base-url --tolerance --max-diff --wait-network --ci --json" -- "${D}cur") ) ;;
    status)    COMPREPLY=( $(compgen -W "--json --brief" -- "${D}cur") ) ;;
    completions) COMPREPLY=( $(compgen -W "bash zsh" -- "${D}cur") ) ;;
  esac
}
complete -F _vestara_completions vestara
`);
  } else if (shell === 'zsh') {
    const zshCommands = COMMANDS.map((c) => `  ${c}`).join('\n');
    console.log(`#compdef vestara
_vestara_commands=(
${zshCommands}
)
_vestara_doctor_subs=(${DOCTOR_SUBS.join(' ')})
_vestara_teams_subs=(${TEAMS_SUBS.join(' ')})
_vestara_session_subs=(${SESSION_SUBS.join(' ')})
_vestara_config_subs=(${CONFIG_SUBS.join(' ')})
_vestara_provider_subs=(${PROVIDER_SUBS.join(' ')})
_vestara_benchmark_subs=(${BENCHMARK_SUBS.join(' ')})
_vestara_demo_subs=(${DEMO_SUBS.join(' ')})
_vestara_screenshot_subs=(${SCREENSHOT_SUBS.join(' ')})
_vestara() {
  local context state state_descr line; typeset -A opt_args
  _arguments -C \\
    '(-h --help)'{-h,--help}'[Show help]' \\
    '(-v --version)'{-v,--version}'[Show version]' \\
    '(-w --watch)'{-w,--watch}'[Watch mode]' \\
    '--json[JSON output]' '--brief[One-line output]' \\
    '1: :->command' '*: :->args'
  case ${D}state in
    command) _describe -t commands 'vestara commands' _vestara_commands ;;
    args)
      case ${D}line[1] in
        doctor) _describe -t subs 'subcommand' _vestara_doctor_subs ;;
        teams) _describe -t subs 'subcommand' _vestara_teams_subs ;;
        session) _describe -t subs 'subcommand' _vestara_session_subs ;;
        config) _describe -t subs 'subcommand' _vestara_config_subs ;;
        provider) _describe -t subs 'subcommand' _vestara_provider_subs ;;
        benchmark) _describe -t subs 'subcommand' _vestara_benchmark_subs ;;
        demo) _describe -t subs 'subcommand' _vestara_demo_subs ;;
        screenshots) _describe -t subs 'subcommand' _vestara_screenshot_subs ;;
        completions) _describe -t subs 'shell' 'bash zsh' ;;
      esac ;;
  esac
}
_vestara
`);
  } else {
    console.log(`${GOLD}Usage: vestara completions bash|zsh${RESET}`);
    console.log(`${GRAY}Example: source <(vestara completions bash)${RESET}\n`);
  }
}
