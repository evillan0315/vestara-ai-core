---
title: Vestara Baseline — Deployment, Identity, Onboarding, and OS Strategy
version: 0.1.0
status: proposed
owner: vestara
last-reviewed: 2026-09-17
next-review: 2026-10-17
---

# VES-BASELINE-001 — Deployment, Identity, Onboarding, and OS Strategy

> **STATUS: FUTURE ARCHITECTURE — NOT AN IMPLEMENTATION COMMITMENT.**
>
> This document preserves decisions from architecture discussion as the long-term
> target. It authorizes **no implementation** of onboarding flows, OS user
> provisioning, dynamic privileged capabilities, privilege escalation paths,
> Marketplace provisioning, installer changes, or User Management changes.
> Unresolved implementation choices are recorded as **HOLD / future milestones**
> in §23. No new contracts are defined here — contract names mentioned as
> future directions must be audited and frozen separately before use.

## Table of Contents

- [0. Scope and Non-Goals](#0-scope-and-non-goals)
- [1. Product Modes — OS Is a Replaceable Substrate](#1-product-modes--os-is-a-replaceable-substrate)
- [2. Vestara AI OS Hides the Underlying Distribution](#2-vestara-ai-os-hides-the-underlying-distribution)
- [3. Installation and Onboarding Are Different Systems](#3-installation-and-onboarding-are-different-systems)
- [4. Onboarding Questions Are Architecture, Not Just UX](#4-onboarding-questions-are-architecture-not-just-ux)
- [5. Engineering Gets Its Own Onboarding Flow](#5-engineering-gets-its-own-onboarding-flow)
- [6. Engineering Onboarding Provisions a Composition](#6-engineering-onboarding-provisions-a-composition)
- [7. Marketplace Is the Composition Center](#7-marketplace-is-the-composition-center)
- [8. OS Capabilities Are Dynamic, Not a Hardcoded Enum](#8-os-capabilities-are-dynamic-not-a-hardcoded-enum)
- [9. Dynamic Capability Must Not Mean Dynamic Root Shell](#9-dynamic-capability-must-not-mean-dynamic-root-shell)
- [10. Humans and Agents Are Separate Identity Domains](#10-humans-and-agents-are-separate-identity-domains)
- [11. User Management Owns Humans](#11-user-management-owns-humans)
- [12. Agents May Receive Dedicated OS Execution Identities (Future)](#12-agents-may-receive-dedicated-os-execution-identities-future)
- [13. Agent Creation Remains an Agents Responsibility](#13-agent-creation-remains-an-agents-responsibility)
- [14. Humans May Grant Agents OS Administrative Capabilities (Governed)](#14-humans-may-grant-agents-os-administrative-capabilities-governed)
- [15. Process Provenance Target](#15-process-provenance-target)
- [16. Onboarding Orchestrates Existing Authorities](#16-onboarding-orchestrates-existing-authorities)
- [17. Linux Distribution Strategy](#17-linux-distribution-strategy)
- [18. Buildroot/Yocto Are Much Later (HOLD)](#18-buildrootyocto-are-much-later-hold)
- [19. Distribution Portability Must Be Designed Now](#19-distribution-portability-must-be-designed-now)
- [20. Host Capability Discovery (Missing Piece)](#20-host-capability-discovery-missing-piece)
- [21. Provisioning Transactions (Missing Piece)](#21-provisioning-transactions-missing-piece)
- [22. Extensible Onboarding (Missing Piece)](#22-extensible-onboarding-missing-piece)
- [23. Consolidated Target Diagram](#23-consolidated-target-diagram)
- [24. Invariant Register](#24-invariant-register)
- [25. HOLD Register — No Implementation Authorized](#25-hold-register--no-implementation-authorized)
- [26. Required Sequencing Before Any Implementation](#26-required-sequencing-before-any-implementation)
- [27. Related Documents](#27-related-documents)

---

## 0. Scope and Non-Goals

**In scope:** preserve the agreed long-term direction for deployment modes,
identity separation, onboarding composition, Marketplace/capability/authority
relationships, OS strategy, and the sequencing gate that must precede any build.

**Non-goals (explicitly NOT authorized by this document):**

- No onboarding UI or runtime implementation.
- No OS user / agent execution-account provisioning.
- No dynamic privileged capability grants or escalation paths.
- No Marketplace provisioning or installer changes.
- No User Management / Agents Console changes.
- No new TypeScript contracts, ports, schemas, or APIs.

Where this document names a future concept (e.g. `SystemServicePort`,
`Host Capability Discovery`), that name is a **directional placeholder** pending
a dedicated audit — not a contract.

---

## 1. Product Modes — OS Is a Replaceable Substrate

Central idea:

```text
Vestara is the product.
The underlying OS is a replaceable substrate.

Vestara AI OS       = deepest system integration
Vestara Live AI OS  = portable/live Vestara environment
Vestara Standalone  = Vestara on an existing OS
Vestara CLI/Runtime = lightweight/headless/cloud execution
```

Deployment modes:

```text
                         VESTARA
                            │
          ┌─────────────────┼──────────────────┐
          │                 │                  │
          ▼                 ▼                  ▼
   Vestara AI OS      Vestara Standalone   Vestara Runtime/CLI
          │                 │                  │
   Installed OS       Existing Host OS      Headless/Cloud/CI
          │            │     │     │
        Linux        Linux  macOS Windows
          │
   Vestara Live AI OS
   also available
```

All modes share the same upper platform:

```text
Activity Room
Global Assistant
Engineering Workspace
Agents
Workflows
Marketplace
Files
Settings
Identity
Permissions
Capabilities
Verification
Evidence
        │
        ▼
Vestara Platform
        │
        ▼
Host/System abstraction
```

What differs is the depth of control Vestara has over the machine. Vestara AI OS
can provide the strongest guarantees (provisioning, system services, agent
execution identities, recovery, permissions, system configuration). Standalone
Vestara must respect an existing Windows/macOS/Linux installation and its
existing users and security model.

Principle:

```text
Vestara AI OS = maximum integration
Standalone    = safe integration with an existing OS

Neither is a prerequisite for using the Vestara platform.
```

**Decision:** Vestara must not require Vestara AI OS.

---

## 2. Vestara AI OS Hides the Underlying Distribution

The normal user must not experience a Debian installer, Debian user creation, or
Debian desktop on the path to Vestara. Instead:

```text
Power On
   ↓
Vestara Boot
   ↓
Try Vestara / Install Vestara / Recovery
   ↓
Vestara Installer
   ↓
Installation
   ↓
Restart
   ↓
Vestara Startup
   ↓
Vestara First-Boot Onboarding
   ↓
Vestara Desktop
```

Underneath:

```text
Vestara Installer
        ↓
Vestara Installation Orchestrator
        ↓
Linux installation mechanisms
        ├── kernel
        ├── bootloader
        ├── partitioning
        ├── filesystems
        ├── drivers/firmware
        ├── networking
        ├── packages
        └── services
```

Boundary:

```text
Linux distribution owns OS mechanics.
Vestara owns product semantics and UX.
```

Advanced/recovery access to the underlying Linux environment must be preserved.
Hidden must not mean inaccessible when troubleshooting or recovering the machine.

---

## 3. Installation and Onboarding Are Different Systems

Three related but distinct experiences.

### 3.1 Vestara AI OS installation (the physical machine)

```text
Vestara Boot
 ↓
Try / Install
 ↓
Language
 ↓
Region / Timezone
 ↓
Keyboard
 ↓
Network
 ↓
Installation target
 ↓
Storage / partitioning
 ↓
Encryption
 ↓
Recovery configuration
 ↓
Install Vestara AI OS
 ↓
Verify installation
 ↓
Restart
```

Low-level work may reuse existing Linux installer mechanisms; Vestara owns the
UI and workflow.

### 3.2 Vestara AI OS first boot

```text
Welcome to Vestara
 ↓
Who are you?
 ↓
Create HumanPrincipal
 ↓
Create/link OS identity
 ↓
Choose authentication
 ↓
Security / recovery
 ↓
Privacy / telemetry
 ↓
Machine authority
 ↓
How will you use Vestara?
 ↓
Choose workspace
 ↓
Workspace-specific onboarding
 ↓
Provision
 ↓
Verify
 ↓
Ready
```

### 3.3 Vestara Standalone onboarding (OS already exists)

```text
Install Vestara
 ↓
Launch
 ↓
Welcome
 ↓
Identify existing OS user
 ↓
Create/link HumanPrincipal
 ↓
Google / GitHub / local authentication
 ↓
Discover host capabilities
 ↓
Request required OS permissions
 ↓
How will you use Vestara?
 ↓
Choose Engineering
 ↓
Engineering onboarding
 ↓
Provision workspace
 ↓
Ready
```

**Decision:** Standalone binds the existing OS user; it does not automatically
create another human OS account.

---

## 4. Onboarding Questions Are Architecture, Not Just UX

Onboarding determines the initial composition of Vestara. The progression:

```text
WHO ARE YOU?
        ↓
HOW DO YOU AUTHENTICATE?
        ↓
WHAT MACHINE IS THIS?
        ↓
WHAT AUTHORITY SHOULD VESTARA HAVE?
        ↓
HOW DO YOU WANT TO USE VESTARA?
        ↓
WHAT WORKSPACE DO YOU NEED?
        ↓
WHAT TOOLS/INTEGRATIONS DO YOU USE?
        ↓
WHAT AGENTS DO YOU WANT?
        ↓
WHAT AUTHORITY SHOULD THOSE AGENTS HAVE?
        ↓
WHAT SHOULD MARKETPLACE PROVISION?
```

First boot must not become 40 technical screens. Retain three configuration
levels:

```text
Recommended
  Vestara chooses sensible defaults.

Customize
  Choose tools, integrations, agents and permissions.

Advanced
  Configure runtimes, providers, models,
  execution isolation, capabilities,
  authority and system integration.
```

---

## 5. Engineering Gets Its Own Onboarding Flow

Answering "What will you use Vestara for?" with `Engineering` starts the
Engineering onboarding contribution. Directional question groups (future,
not specified):

```text
What do you build?

□ Web / Full Stack
□ Backend / APIs
□ Mobile
□ Cloud / DevOps
□ AI / ML
□ Data
□ Embedded / Systems
```

```text
Where do you develop?

○ Local repositories
○ Remote repositories
○ Containers
○ Remote development machines
○ Local + remote
```

Source control (provider, authentication, default workspace directory, repos to
import/clone), environment discovery (Git, Node.js, pnpm, Docker, Python, Go,
Kubernetes, etc.), AI/runtime configuration (providers, models, local vs remote
execution, cost/resource preferences), and agents.

Principle: Vestara should not ask questions it can safely discover the answer to.

---

## 6. Engineering Onboarding Provisions a Composition

An Engineering Workspace is a provisioned composition, not merely a route:

```text
Engineering Workspace
│
├── Applications
│   ├── Editor
│   ├── Terminal
│   ├── Preview
│   └── Git
│
├── Modules
│   ├── Testing
│   ├── Generator
│   └── Deployment
│
├── Integrations
│   ├── GitHub
│   └── Cloud providers
│
├── Agents
│   ├── Companion
│   ├── Developer
│   ├── Reviewer
│   └── Observer
│
├── Workflows
├── Capabilities
├── Authority Policies
└── Layout Preferences
```

Marketplace resolves that composition (§7).

---

## 7. Marketplace Is the Composition Center

Marketplace distributes more than conventional "apps":

```text
Vestara Package
├── Module
├── Agent
├── Tool
├── Skill
├── Workflow
├── Runtime
├── Provider integration
├── UI contribution
├── Capability definitions
├── Executor adapters
└── Configuration schema
```

Separation of concerns:

```text
Marketplace
"What can Vestara install/use?"

Capability Registry
"What capabilities exist on this installation?"

Identity
"Who is requesting something?"

Authority
"What may they do?"

System Broker
"Can this operation execute?"

Evidence
"What actually happened?"
```

Critical invariant:

```text
Marketplace availability ≠ Authority
```

Installing a package providing `system.service.restart` only makes that
capability available for assignment — it grants nothing by itself.

---

## 8. OS Capabilities Are Dynamic, Not a Hardcoded Enum

Decision: OS capabilities must **not** become a giant hardcoded enum. Examples
of the capability space (illustrative, not a registry):

```text
process.inspect
process.signal

service.inspect
service.start
service.stop
service.restart

system.logs.read
system.info.read

package.inspect
package.install

filesystem.read
filesystem.write

network.inspect
network.configure

user.inspect
user.create
user.modify
```

Resolution chain (target):

```text
Marketplace
     ↓
Capability Package
     ↓
Capability Registry
     ↓
Authority Profile
     ↓
Human / Agent
     ↓
Policy Evaluation
     ↓
System Broker
     ↓
Host OS
```

Capability metadata (directional — schema is HOLD, see §25):

```text
ID
version
category
risk
parameter schema
scope
executor requirement
approval policy
platform compatibility
availability
```

Grant scoping example (illustrative):

```text
Developer — system.service.restart — scope: vestara-* — approval: automatic
Observer  — system.service.inspect — scope: * / system.service.restart — DENIED
```

Separations:

```text
Capability Definition ≠ Capability Grant
Capability Grant ≠ Capability Policy
Capability Policy ≠ Execution
```

---

## 9. Dynamic Capability Must Not Mean Dynamic Root Shell

The capability catalog may be dynamic; the privileged enforcement boundary must
not be arbitrary. A package record must never conjure privileged authority such
as `sudo ${arbitraryCommand}`.

Target enforcement shape:

```text
Dynamic Capability
       ↓
Trusted Executor Adapter
       ↓
Validated Parameters
       ↓
System Broker
       ↓
OS
```

Example:

```text
system.service.restart
        ↓
SystemServiceExecutor
        ↓
restart(validatedService)
```

---

## 10. Humans and Agents Are Separate Identity Domains

```text
Identity Platform
│
├── Human Identity
│      ↓
│   User Management
│
├── Agent Identity
│      ↓
│   Agents Console
│
├── Authentication Bindings
│   ├── Google
│   ├── GitHub
│   ├── local
│   └── others
│
└── OS Identity
    ├── Human OS Account
    └── Agent Execution Account
```

Invariants:

```text
HumanPrincipal ≠ AgentPrincipal

User Management ≠ Agents Console

Vestara Identity ≠ Authentication Identity

Vestara Identity ≠ OS Identity

Human OS Account ≠ Agent Execution Account
```

Note: `HumanPrincipal` / `AgentPrincipal` here are target-architecture terms.
They do not yet exist as code contracts; identity work must start from the
existing canonical registry (`docs/IDENTITY-OWNERSHIP.md`) and the sequencing
gate in §26.

---

## 11. User Management Owns Humans

Humans are created and managed through User Management. External
authentications are **bindings to a canonical human record**, not separate
humans:

```text
HumanPrincipal
    │
    ├── GoogleIdentity
    ├── GitHubIdentity
    ├── LocalCredential
    └── HostIdentity
```

HostIdentity maps per platform: UID/GID on Standalone Linux, native Windows
security identity on Windows, corresponding host account on macOS.

---

## 12. Agents May Receive Dedicated OS Execution Identities (Future)

Target direction — instead of every agent executing as the logged-in human:

```text
Human
  eddie

Agents (OS execution identities)
  vestara-developer
  vestara-reviewer
  vestara-observer
```

The OS account is not the agent itself:

```text
AgentDefinition
      ↓
AgentPrincipal
      ↓
Role / Capabilities / Authority
      ↓
ExecutionPrincipal
      ↓
OS Execution Identity
```

This lets the host OS enforce isolation (e.g. Developer gets repository write;
Reviewer gets read plus evidence-writing; Observer inspects processes/logs with
no mutation). **HOLD:** no OS accounts are created by this document (§25).

---

## 13. Agent Creation Remains an Agents Responsibility

Creating an OS account (e.g. `vestara-developer`) at the Linux level must
**not** create a Vestara agent, and creating a human must not create an agent.
Target lifecycle:

```text
Agents Console
     ↓
Create Agent
     ↓
AgentPrincipal
     ↓
AgentDefinition
     ↓
Role / Skills / Capabilities
     ↓
Authority
     ↓
Execution policy
     ↓
Request OS identity provisioning
     ↓
System/Identity authority
     ↓
Host OS
```

Neither Agents nor User Management may embed `useradd`/`usermod`, Windows
account APIs, or equivalent directly — those go through the System/OS Identity
platform and privileged broker (future; HOLD).

---

## 14. Humans May Grant Agents OS Administrative Capabilities (Governed)

A human administrator may deliberately grant an agent powerful OS capabilities,
subject to:

```text
Agent has OS administrative authority
                 ≠
Agent permanently runs as root
```

Execution shape:

```text
Developer Agent
      ↓
requests privileged operation
      ↓
System Broker
      ↓
Who requested it?
      ↓
What capability was granted?
      ↓
What scope?
      ↓
What risk?
      ↓
Does it require human approval?
      ↓
Execute
      ↓
Evidence
```

Granular capabilities, with an OS Administrator profile/preset that resolves
into explicit capabilities — never a magical `isAdmin` boolean. And:

```text
Agent cannot grant itself authority.
Agent cannot expand its own scope.
Agent cannot change its execution identity.
Agent cannot modify its governing policy.
```

Human/root recovery authority must remain independently recoverable.

---

## 15. Process Provenance Target

Motivated by the real 3001/5173 investigation: OS user, PID, command, cgroup,
and partial execution context could be proven, but the originating
human/agent/session could not be reliably identified. The long-term target:

```text
HumanPrincipal
      ↓
WorkflowRun
      ↓
AgentPrincipal
      ↓
OperationId
      ↓
RuntimeSession
      ↓
ExecutionPrincipal
      ↓
OS UID / SID
      ↓
PID
      ↓
cgroup / process tree
      ↓
command
      ↓
ports
      ↓
artifacts/evidence
```

This gives the System/Services surface stronger provenance than "node is
listening on port 3001." Correlation mechanics are HOLD (§25).

---

## 16. Onboarding Orchestrates Existing Authorities

Principle:

```text
Onboarding ≠ Configuration Authority
```

GitHub configuration belongs to Integrations; agents to Agents; package
lifecycle to Marketplace; grants to Authority; OS identity to System/OS
Identity. Onboarding orchestrates them. Everything configured during onboarding
must remain editable later:

```text
Onboarding choice           Management surface

Human                     → Users
Authentication            → Identity / Connections
OS account                → Users / System
Workspace                 → Workspaces
Engineering configuration → Engineering Settings
Agents                    → Agents
Agent authority           → Agents / Authority
Capabilities              → System / Capabilities
Packages                  → Marketplace
Providers/models          → AI / Providers
Layout                    → Appearance / Layout
GitHub                    → Integrations
```

This prevents setup-wizard configuration that can never be found again.

---

## 17. Linux Distribution Strategy

The upper Vestara architecture must not encode a distribution. Priorities for
Vestara AI OS, in order:

```text
Hardware compatibility
        ↓
Software/runtime compatibility
        ↓
Security
        ↓
Reliability
        ↓
Recovery/update model
        ↓
Marketplace compatibility
        ↓
Resource consumption
        ↓
Image size
```

Reference comparison (directional, not a selection contract):

| Option | Main advantage | Main disadvantage | Best Vestara role |
| ------ | -------------- | ----------------- | ----------------- |
| Debian Minimal | Compatibility, stability, packages, glibc/systemd, hardware ecosystem | Larger than minimalist distributions | Current AI OS reference |
| Alpine | Extremely small, excellent for containers/headless | musl/OpenRC compatibility differences | Cloud workers, CLI, containers |
| Ubuntu | Hardware/vendor support, large ecosystem | Heavier; little reason over Debian for a controlled image | Possible desktop/enterprise target |
| Ubuntu Core | Transactional/immutable appliance model | Snap-centric, constrained | Appliance-style experiment |
| Arch | Current packages, flexibility | Rolling-release maintenance burden | Development/prototyping, not first production OS choice |
| Fedora | Modern kernel/userspace, strong desktop | Faster cadence, more maintenance | Modern desktop/runtime experimentation |
| openSUSE | Strong tooling; transactional variants interesting | Smaller target ecosystem | Immutable/transactional research |
| Buildroot | Extremely small purpose-built image | We own far more OS integration | Long-term specialized image (HOLD) |
| Yocto | Powerful custom product-OS construction | High complexity/build/maintenance cost | Long-term mature product OS (HOLD) |

**Decision:** Debian Minimal remains the reference for Vestara AI OS today —
glibc compatibility, systemd, package availability, hardware support, mature
desktop infrastructure, and compatibility with Node/native modules/Chromium/
developer tooling let engineering effort concentrate on Vestara.

Alpine is the directional choice for headless workloads:

```text
Vestara AI OS       → Debian/minimal glibc Linux initially

Vestara Cloud       → Alpine attractive

Vestara CI Worker   → Alpine where compatible

Vestara CLI         → Alpine-compatible

Special workloads   → workload-specific image
```

A scheduler could eventually select workers by task (TypeScript → Alpine;
browser → glibc/Chromium; GPU → NVIDIA/CUDA; Windows/macOS builds → native
workers), reinforcing:

```text
Agent ≠ Model ≠ Runtime ≠ Operating System
```

Image size alone must not drive the choice.

---

## 18. Buildroot/Yocto Are Much Later (HOLD)

A purpose-built image is strategically interesting only at maturity:

```text
Linux Kernel
+
selected firmware
+
selected userspace
+
Vestara system services
+
Vestara Desktop
+
Vestara Platform
+
recovery/update infrastructure
=
Purpose-built Vestara AI OS
```

Doing that now would convert engineering effort into Linux distribution
engineering. **HOLD** — recorded as a future milestone, not a plan.

---

## 19. Distribution Portability Must Be Designed Now

Even with Debian as reference, upper-platform concepts must not be named after
a distribution. Directional port names (placeholders — **not contracts**):

```text
SystemServicePort
PackageManagerPort
IdentityProvisioningPort
ProcessPort
NetworkPort
StoragePort
BootPort
ScreenCapturePort
```

with per-platform adapters:

```text
SystemServicePort
├── SystemdAdapter
├── OpenRCAdapter
├── WindowsServiceAdapter
└── LaunchdAdapter
```

This is what makes Standalone Windows/macOS/Linux possible without
contaminating upper platform architecture.

```text
Vestara Platform
       ↓
System Contracts (future — HOLD, see §25)
       ↓
System Broker (future — HOLD)
       ↓
Linux Platform Adapter (future — HOLD)
       ↓
Distribution-specific implementation
```

---

## 20. Host Capability Discovery (Missing Piece)

Vestara needs to answer "what can THIS machine actually do?" — right now, not
theoretically (illustrative dimensions):

```text
Host Capability Discovery

OS
  Linux

Distribution
  Debian

Service Manager
  systemd

Display
  Wayland

Screen Capture
  portal/PipeWire available

Containers
  Docker available

GPU
  NVIDIA available

Agent OS Isolation
  supported

Privileged Broker
  available

Browser Automation
  available
```

Marketplace, onboarding, Agents, and Workflows reason from actual capabilities
so Vestara never presents options the machine cannot support. Design is HOLD;
the existing read-only observation baseline is `docs/foundation/12-os-0-host-integration.md`
(`@vestara/host-runtime`), which this future work must build on, not duplicate.

---

## 21. Provisioning Transactions (Missing Piece)

Onboarding may provision ten things and fail on number seven:

```text
HumanPrincipal       READY
OS identity          READY
Engineering package  READY
GitHub               READY
Developer Agent      READY
Developer OS account FAILED
Reviewer Agent       PENDING
```

That must not remain an unexplained broken setup. Target lifecycle:

```text
PLAN
 ↓
VALIDATE
 ↓
PROVISION
 ↓
VERIFY
 ↓
READY

or

FAILED
 ↓
REPAIR / RETRY / ROLLBACK / HOLD
```

This fits the evidence-oriented architecture. Mechanics are HOLD.

---

## 22. Extensible Onboarding (Missing Piece)

Marketplace packages should eventually contribute **declarative** onboarding
requirements, e.g.:

```text
Engineering Package
      ↓
contributes

engineering.profile
engineering.repositories
engineering.toolchains
engineering.integrations
engineering.providers
engineering.agents
engineering.authority
```

Packages contribute declarations — never arbitrary privileged onboarding code.
The Onboarding Runtime stays governed. Contribution schema is HOLD.

---

## 23. Consolidated Target Diagram

```text
                         VESTARA
                            │
              ┌─────────────┴─────────────┐
              │                           │
       Vestara AI OS                Vestara Standalone
              │                           │
      Linux substrate             Existing Host OS
              │                    Linux/macOS/Windows
              └─────────────┬─────────────┘
                            │
                      ONBOARDING
                            │
                    HumanPrincipal
                            │
              Authentication Bindings
                            │
                    Host/OS Identity
                            │
                     Use-Case Profile
                            │
                Engineering Workspace
                            │
                       Marketplace
                            │
             ┌──────────────┼──────────────┐
             │              │              │
           Agents         Tools         Modules
             │              │              │
             └──────────────┼──────────────┘
                            │
                   Capability Registry
                            │
                     Authority Policy
                            │
              ┌─────────────┴─────────────┐
              │                           │
       HumanPrincipal               AgentPrincipal
                                          │
                                  ExecutionPrincipal
                                          │
                                  OS Execution Identity
                                          │
                                    System Broker
                                          │
                                  Host OS Adapter
                                          │
                    ┌─────────────────────┼──────────────┐
                    │                     │              │
                  Linux                 Windows        macOS
                    │
             ┌──────┴─────────┐
             │                │
          systemd           OpenRC
             │                │
          Debian           Alpine
```

---

## 24. Invariant Register

| # | Invariant | Section |
|---|-----------|---------|
| INV-BASE-01 | Vestara AI OS = maximum integration; Standalone = safe integration; neither is a prerequisite | §1 |
| INV-BASE-02 | Linux distribution owns OS mechanics; Vestara owns product semantics and UX | §2 |
| INV-BASE-03 | Installation ≠ first boot ≠ Standalone onboarding | §3 |
| INV-BASE-04 | Standalone binds the existing OS user | §3 |
| INV-BASE-05 | Marketplace availability ≠ Authority | §7 |
| INV-BASE-06 | Capability Definition ≠ Grant ≠ Policy ≠ Execution | §8 |
| INV-BASE-07 | Dynamic catalog; non-arbitrary privileged enforcement boundary | §9 |
| INV-BASE-08 | HumanPrincipal ≠ AgentPrincipal; User Management ≠ Agents Console | §10 |
| INV-BASE-09 | Vestara Identity ≠ Authentication Identity ≠ OS Identity | §10–11 |
| INV-BASE-10 | Human OS Account ≠ Agent Execution Account | §10, §12 |
| INV-BASE-11 | Creating an OS account never creates a Vestara agent (and reverse) | §13 |
| INV-BASE-12 | Agent admin authority ≠ permanently running as root | §14 |
| INV-BASE-13 | Agent cannot grant/expand/change its own authority, scope, execution identity, or policy | §14 |
| INV-BASE-14 | Onboarding ≠ Configuration Authority; every onboarding choice stays editable later | §16 |
| INV-BASE-15 | Agent ≠ Model ≠ Runtime ≠ Operating System | §17 |

---

## 25. HOLD Register — No Implementation Authorized

| HOLD ID | Item | Status |
|---------|------|--------|
| HOLD-BASE-01 | Onboarding UI/runtime (all modes, all flows) | Future milestone — HOLD |
| HOLD-BASE-02 | OS user / agent execution-account provisioning | Future milestone — HOLD |
| HOLD-BASE-03 | Dynamic privileged capability grants / escalation paths | Future milestone — HOLD |
| HOLD-BASE-04 | Marketplace provisioning from onboarding | Future milestone — HOLD |
| HOLD-BASE-05 | Installer changes (Vestara Installer / orchestrator) | Future milestone — HOLD |
| HOLD-BASE-06 | User Management / Agents Console changes | Future milestone — HOLD |
| HOLD-BASE-07 | System Contracts / System Broker / platform adapters (§19 port names) | Future milestone — HOLD, names are placeholders not contracts |
| HOLD-BASE-08 | Host Capability Discovery design | Future milestone — HOLD, builds on OS-0 host-runtime baseline |
| HOLD-BASE-09 | Provisioning transaction lifecycle (PLAN→VALIDATE→PROVISION→VERIFY→READY) | Future milestone — HOLD |
| HOLD-BASE-10 | Declarative onboarding contribution schema | Future milestone — HOLD |
| HOLD-BASE-11 | Provenance correlation chain (§15) | Future milestone — HOLD |
| HOLD-BASE-12 | Buildroot/Yocto purpose-built image | Far-future milestone — HOLD |
| HOLD-BASE-13 | Capability metadata/grant schema (§8) | Future milestone — HOLD, illustrative only |

---

## 26. Required Sequencing Before Any Implementation

> Do not implement Linux agent users, onboarding, dynamic privileged
> capabilities, or User Management independently. The architecture crosses too
> many authority boundaries for isolated implementation.

Required order:

```text
Audit + freeze:
  Identity → Human/Agent Principal → Capability Registry → Authority
    → Execution Principal → OS Identity → System Broker
    → Marketplace contribution → Provisioning
Then, and only then:
  User Management → Agents Console → Standalone onboarding
    → eventually Live/AI OS onboarding
  (all consuming the same frozen contracts)
```

This prevents building four different identity/provisioning systems and merging
them later.

---

## 27. Related Documents

- `docs/AI-OS-ARCHITECTURE.md` — enduring service model / boot lifecycle baseline.
- `docs/foundation/12-os-0-host-integration.md` — OS-0 machine-plane boundary; read-only host observation; deny-by-default power ops (baseline §20 builds on).
- `docs/IDENTITY-OWNERSHIP.md` — canonical identity registry; starting point for any Human/Agent Principal work (§26 audit input).
- `docs/CAPABILITY-REGISTRY.md` — existing capability catalog baseline for §7–8 work.
- `docs/ADR/ADR-002-capability-system.md`, `docs/ADR/ADR-008-marketplace-capabilities.md` — capability/Marketplace decisions.
- `docs/PCS-016-os-integration.md`, `docs/PCS-017-boot-experience.md` — OS integration / boot experience context.
- `docs/PCS-020-conversational-onboarding.md`, `docs/UX-011-conversational-onboarding.md`, `docs/ATS-011-conversational-onboarding.md` — conversational onboarding tracks (distinct from, but related to, system onboarding here).
- `os/` — host integration deployment artifacts (systemd units, image builder); not a runtime package.
