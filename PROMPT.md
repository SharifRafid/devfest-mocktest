# Prompt Log

This file records every prompt given to AI tools (Claude Code) while building Smart Escape, as required for the judges by rulebook §8.4.
Entries are appended automatically by a Claude Code `UserPromptSubmit` hook (`scripts/log-prompt.sh`, configured in `.claude/settings.json`). Prompts given to other AI tools are appended manually.

## Prompt 1 — setup

I'm currently participating in a vibe coding contest, read the rule book from @AI_DevFest_Vibe_Coding_Rulebook.pdf and the @Smart_Escape_Problem_Statement.pdf problem statement that I need to solve. Based on the rulebook and the problemset write me a CLAUDE.md with the rules that are needed for strictly maintaining the attached rulebook of this contest. Use plain html, css and vanilla JS for this project to keep it light, fast and easy to deploy, my initial plan is to deploy using github pages but if its down I also have netlify and vercel CLI installed. Now based on the attached files run one agent to properly understand the problemset, figure out all the possible edgecases and any hidden test case or anything that might make us delayed in development if not kept in mind beforehand, then run another agent for creating the claude file and any other required files for properly managing the project according to the rulebook and also for running and maintaining the necessary tests for this project. The test dataset for this project is attached as well: '/Users/sharifrafid/Projects/devfest-mocktest/building.json', make sure this data file or any other similar data file can also be uploaded from the frontend directly so it stays dynamic but use this as the fallback or default. Also we will need to provide these prompts starting with this one to the judge panel so create a PROMPT file in this directory and give me the fastest way to put all the prompts I'll use in that file either automated or manually. Now after running the individual agents run the plan agent finally to create a detailed plan md file with checklists of the given problem set's solution in the exact expected way mentioned in the problem statement. /effort

## 2026-10-06 05:59

Yes, commit and push, make sure the commit message includes the initial prompt that I've given and also the changes made so far.

## 2026-10-06 05:59

start phase 2, implement the validator and router

## 2026-10-06 06:02

Continue phase 3

## 2026-10-06 06:07

Continue phase 4
