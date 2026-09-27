# Hone

Hone is a desktop app for taking Markdown notes and working on projects (study or code) alongside AI agents tailored to the person using it.

## Language

**Workshop**:
The top-level folder Hone opens. It holds every project, the profile, the library and the generator. Hone finds it by walking up from wherever it is opened until it reaches the folder that contains `.hone/generator/`. It has no `AGENTS.md` of its own. The user creates one from Hone by naming a new folder; a workshop is never created inside another.
_Avoid_: vault, root, workspace

**Note**:
Any Markdown (`.md`) file in the workshop, including agent files such as `AGENTS.md` or `PROGRESS.md`. Everything else is just a file.
_Avoid_: page, document

**Project**:
A folder Hone recognizes as a unit of work because it has its own metadata, agent and progress. Projects can be nested, but each one is self-contained.
_Avoid_: repo (a project may have no code)

**Generator**:
The agent that creates new projects and refines their agents and the profile. It lives in `.hone/generator/` at the workshop root, so no project inherits its instructions. It only reads inside the workshop, except for listing the names of the user's global skills.
_Avoid_: creator, meta-agent

**Onboarding**:
The first-run interview where the generator asks the user about what they study, know and how they like to learn, and writes the initial profile.
_Avoid_: setup, wizard

**Cascade**:
Pushing changes down from the generator or a parent project into the inherited context of the projects below. It only flows downward.
_Avoid_: sync, flood, propagation

**Inherited context**:
The part of a project written only by those above it (the generator and the parent project): a summary of the profile and of the parent. The project's own agent reads it but never edits it.
_Avoid_: parent context, shared context

**Profile**:
What Hone knows about its user: prior knowledge, preferences and goals. The generator reads it to tailor each project.
_Avoid_: user, config

**Library**:
The folder inside the workshop where the user keeps reusable skills and scripts. The generator offers them when creating or refining a project and copies the chosen ones into it, customized if asked, under names that don't collide with any other skill visible from the project. The user can also ask the generator to import one of their global skills into it, under a new name.
_Avoid_: catalog, templates

**Script**:
A library item that is a program to run from the terminal, not instructions for a model (for example, a loop that runs an agent unattended).

**Nearby projects**:
The subprojects and related projects listed in a project's agent instructions, with when each is worth consulting. The agent reads them on demand, never automatically.
_Avoid_: dependencies, links

**Progress**:
The record of what was learned and done inside a project, so that a new session or a different model can pick up where the last one left off. It only contains what the user confirmed.
_Avoid_: history, log

**Close**:
The end-of-session step where the agent proposes what to add to the progress and the user confirms or corrects it before anything is written.
_Avoid_: save, commit

**Quick close**:
A close that skips confirmation and leaves the proposal in the progress inbox for later review.

**Progress inbox**:
Unconfirmed progress drafts left by a quick close. The agent offers to review them at the start of the next session.
_Avoid_: pending, temp
