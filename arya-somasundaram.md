---
type: person
title: Arya Somasundaram
aliases:
  - Arya Somasundaram
  - Arya
updated: '2026-07-09T00:00:00.000Z'
ingested_via: put_page
ingested_at: '2026-08-06T17:57:02.069Z'
source_kind: put_page
tags:
  - cv
  - profile
  - resume
---

# Arya Somasundaram

> UCLA computer science student focused on AI engineering, backend systems, research tooling, and applied machine learning. [Source: Resume PDF, `/Users/aryasomasundaram/Downloads/Resume - Arya Somasundaram.pdf`, extracted 2026-07-09]

## State

- **Name:** Arya Somasundaram. [Source: Resume PDF, `/Users/aryasomasundaram/Downloads/Resume - Arya Somasundaram.pdf`, extracted 2026-07-09]
- **Email:** arysom992@gmail.com. [Source: Resume PDF, `/Users/aryasomasundaram/Downloads/Resume - Arya Somasundaram.pdf`, extracted 2026-07-09]
- **Phone:** (510) 641-6099. [Source: Resume PDF, `/Users/aryasomasundaram/Downloads/Resume - Arya Somasundaram.pdf`, extracted 2026-07-09]
- **Education:** B.S. Computer Science, University of California, Los Angeles, expected June 2028. [Source: Resume PDF, `/Users/aryasomasundaram/Downloads/Resume - Arya Somasundaram.pdf`, extracted 2026-07-09]
- **Relevant coursework:** Software Construction; Intro to Computer Organizations; Object Oriented Programming in C++; Data Structures in C++. [Source: Resume PDF, `/Users/aryasomasundaram/Downloads/Resume - Arya Somasundaram.pdf`, extracted 2026-07-09]

## Public Profiles

- **LinkedIn:** http://linkedin.com/in/arya-soma [Source: Resume PDF link annotation, `/Users/aryasomasundaram/Downloads/Resume - Arya Somasundaram.pdf`, extracted 2026-07-09]
- **Google Scholar:** https://scholar.google.com/citations?user=krrddUoAAAAJ&hl=en [Source: Resume PDF link annotation, `/Users/aryasomasundaram/Downloads/Resume - Arya Somasundaram.pdf`, extracted 2026-07-09]
- **GitHub:** https://github.com/ArS377 [Source: Resume PDF link annotation, `/Users/aryasomasundaram/Downloads/Resume - Arya Somasundaram.pdf`, extracted 2026-07-09]
- **Website:** https://aryasoma.com/ [Source: Resume PDF link annotation, `/Users/aryasomasundaram/Downloads/Resume - Arya Somasundaram.pdf`, extracted 2026-07-09]

## Current Resume And CV Files

- **Current resume:** `/Users/aryasomasundaram/Downloads/Resume - Arya Somasundaram.pdf`, modified 2026-06-30 13:30. [Source: filesystem search and PDF metadata, 2026-07-09]
- **Current CV:** `/Users/aryasomasundaram/Downloads/CV - Arya Somasundaram.pdf`, modified 2026-06-30 13:28. [Source: filesystem search and PDF metadata, 2026-07-09]
- **Website resume copy:** `/Users/aryasomasundaram/Documents/GitHub/Personal-Website/public/resume.pdf`, modified 2026-06-24 21:07. [Source: filesystem search and PDF metadata, 2026-07-09]

## Experience

- **AI Engineering Intern, Arvya, Inc.** June 2026 to present.
  - Built FastAPI backend services integrating PostgreSQL/PostgREST and Outlook data with agentic web search to generate cited deal updates for IB/PE workflows. Automated CRM update logic on DealCloud/Salesforce and deployed agentic skills on E2B Sandbox for financial analysis and audited Excel artifact generation. [Source: Resume PDF, `/Users/aryasomasundaram/Downloads/Resume - Arya Somasundaram.pdf`, extracted 2026-07-09]
  - Built and hardened an end-to-end onboarding workflow across Next.js, FastAPI, PostgreSQL/PostgREST, and Microsoft Outlook: authenticated setup gating, idempotent setup starts, durable progress and completion state, redirect-loop prevention, deal-email filtering, and a full 30-day inbox scan. [Source: `agent-onboarding-setup-progress` branch commits `fa759f3a` through `947ffdf5`, reviewed 2026-07-17]
  - Redesigned the setup and dashboard experience to match Arvya's product system, including responsive content widths, non-overlapping Ask Arvya panels, clearer setup progress, and clean scanning-state typography and spacing. [Source: commits `56ab3eeb`, `241472aa`, and implementation session, 2026-07-17]
  - Shipped a responsive email activity workspace that uses a full-width list until selection and a master-detail layout afterward; added clean subject normalization, clickable email details, live retrieval of original Outlook message bodies, and readable forwarded-message formatting that preserves metadata while removing decorative separators. [Source: commits `241472aa` and `a3744192`, 2026-07-17]
  - Implemented source-verifiable Ask Arvya answers with inline, clickable citations to the original Outlook emails, carrying source metadata through retrieval tools, streaming, Deal Brain synthesis, and supervisor orchestration so bankers can verify key facts before meetings. [Source: commit `3c99d035`, 2026-07-17]
  - Generalized email evidence for sparse-deal and arbitrary-prompt retrieval using bounded concurrent Microsoft Graph searches, citation validation and repair, Graph-message deduplication, per-claim and table-row citation rules, and email-only provenance when email evidence is available; raw message bodies remain transient and are not persisted. [Source: uncommitted `agent-onboarding-setup-progress` changes in `backend/services/deal_retrieval.py`, `backend/agents/**`, and `backend/tests/deal_brain/test_citations.py`, reviewed 2026-07-17]
  - Diagnosed cross-layer failures including a missing PostgREST setup RPC, setup-queue 500s, frontend fetch/build errors, and citations being rewritten or migrated to headings; added regression coverage and verified the relevant Deal Brain, streaming, and supervisor suite with 188 passing tests plus a passing frontend type-check. [Source: implementation and verification session on `agent-onboarding-setup-progress`, 2026-07-17]
  - Delivered per-user Calendar Briefs controls across a React/Next.js/TypeScript Settings UI and authenticated FastAPI APIs, preserving calendar synchronization while independently gating webhook routing and catch-up brief generation. Added preference persistence, separate email-delivery controls, and regression-isolated pytest coverage. [Source: PR #320, https://github.com/Pbabu-Github/arvya_v2/pull/320, submitted 2026-08-05]
  - Built a schema-driven meeting-to-CRM proposal pipeline for DealCloud: batched transcript fact extraction, evidence-grounded quotes, active-schema field matching, typed coercion and confidence gates, canonical current-value comparison, and reviewable claims that preserve human approval and immutable command execution. [Source: PR #320, https://github.com/Pbabu-Github/arvya_v2/pull/320, submitted 2026-08-05]
  - Implemented privacy-preserving recurring no-brief caching for Microsoft Graph calendar webhook, calendar-sync, pre-call fallback, and overnight-generation paths. Added PostgreSQL/Supabase migrations and a tenant/mailbox-scoped SHA-256 attendee-pattern cache with fail-open behavior, durable hit tracking, and exact normalized external-attendee matching. [Source: PR #321, https://github.com/Pbabu-Github/arvya_v2/pull/321, submitted 2026-08-05]
  - Added targeted backend coverage for webhook routing, sync/fallback behavior, cache persistence, CRM claims, and overnight/pre-call workers; validated the PRs with focused automated suites and frontend type checks. [Source: PRs #320–321, https://github.com/Pbabu-Github/arvya_v2/pull/320, https://github.com/Pbabu-Github/arvya_v2/pull/321]
- **Software Engineer, UCLA Bruin Racing.** September 2025 to present. Architected a C++ telemetry pipeline for Arduino byte data, exported serial outputs into CSV files with Python and pySerial, and designed a Python depacketizer for PlatformIO-simulated Arduino data for an offroad racing vehicle. [Source: Resume PDF, `/Users/aryasomasundaram/Downloads/Resume - Arya Somasundaram.pdf`, extracted 2026-07-09]
- **Undergraduate Researcher, UCLA Biomimetic Lab.** November 2025 to June 2026. Simulated EEG signals from Alzheimer's MRI data in The Virtual Brain, built a Python MRI visualizer for tau protein burden analysis, and developed a Bayesian inference pipeline using Jansen-Rit neural mass model simulations on an 84-node brain connectivity graph with VBI. [Source: Resume PDF, `/Users/aryasomasundaram/Downloads/Resume - Arya Somasundaram.pdf`, extracted 2026-07-09]
- **Full Stack Developer, AdmitTrack.** June 2025 to September 2025. Built a MERN stack college application web app, implemented REST APIs for college data search, and added OAuth-based portal authentication. [Source: Resume PDF, `/Users/aryasomasundaram/Downloads/Resume - Arya Somasundaram.pdf`, extracted 2026-07-09]

## Research And Publications

- **Accepted Paper at NeurIPS 2024 Workshop - Mitigating Biases of LLMs.** Implemented and proposed a Python multi-agent collaborative framework with three agents and a RAG system to reduce LLM embedding biases and hallucinations; paper accepted to a NeurIPS 2024 workshop and uploaded to arXiv cs.CL. [Source: Resume PDF, `/Users/aryasomasundaram/Downloads/Resume - Arya Somasundaram.pdf`, extracted 2026-07-09]
- **OpenReview link for NeurIPS workshop paper:** https://openreview.net/forum?id=AHcbUV6M6V [Source: Resume PDF link annotation, `/Users/aryasomasundaram/Downloads/Resume - Arya Somasundaram.pdf`, extracted 2026-07-09]
- **Neuromorphic Computing and Engineering Journal - SpikeATE.** Developed an LLM-agent data labeling pipeline for aspect B-I-O labels with spaCy for aspect term extraction on unlabeled Amazon and Yelp sentiment datasets; co-authored a peer-reviewed NCE Journal paper proposing SNNs for ATE. [Source: Resume PDF, `/Users/aryasomasundaram/Downloads/Resume - Arya Somasundaram.pdf`, extracted 2026-07-09]
- **IOP/NCE link for SpikeATE paper:** https://iopscience.iop.org/article/10.1088/2634-4386/ae65d6 [Source: Resume PDF link annotation, `/Users/aryasomasundaram/Downloads/Resume - Arya Somasundaram.pdf`, extracted 2026-07-09]

## Projects

- **Bruin Baja telemetry repository:** https://github.com/LegitimateAMX/bruin_baja_telemetry [Source: Resume PDF link annotation, `/Users/aryasomasundaram/Downloads/Resume - Arya Somasundaram.pdf`, extracted 2026-07-09]
- **AdmitTrack repository:** https://github.com/ArS377/AdmitTrack-College-Application-Tracker [Source: Resume PDF link annotation, `/Users/aryasomasundaram/Downloads/Resume - Arya Somasundaram.pdf`, extracted 2026-07-09]

## Skills

- **Programming languages:** C++, Python, Java, JavaScript, Bash. [Source: Resume PDF, `/Users/aryasomasundaram/Downloads/Resume - Arya Somasundaram.pdf`, extracted 2026-07-09]
- **Frameworks/libraries:** React.js, Node.js, Express.js, FastAPI, Bootstrap, Pandas, NumPy, pytest. [Source: Resume PDF, `/Users/aryasomasundaram/Downloads/Resume - Arya Somasundaram.pdf`, extracted 2026-07-09]
- **AI/ML:** PyTorch, TensorFlow, spaCy, HuggingFace, OpenAI APIs, LLMs, FAISS, Autogen. [Source: Resume PDF, `/Users/aryasomasundaram/Downloads/Resume - Arya Somasundaram.pdf`, extracted 2026-07-09]
- **Tools:** AWS, Git, REST APIs, MongoDB, PostgreSQL, E2B Sandbox. [Source: Resume PDF, `/Users/aryasomasundaram/Downloads/Resume - Arya Somasundaram.pdf`, extracted 2026-07-09]

## Open Threads

- Decide whether the canonical public resume should be the newer Downloads resume or the `Personal-Website/public/resume.pdf` copy, since the website copy has slightly different Arvya and Bruin Racing bullets. [Source: comparison of `/Users/aryasomasundaram/Downloads/Resume - Arya Somasundaram.pdf` and `/Users/aryasomasundaram/Documents/GitHub/Personal-Website/public/resume.pdf`, extracted 2026-07-09]

<!-- timeline -->

## Timeline

- **2026-07-09** | Resume/CV discovery - Found current resume and CV PDFs in Downloads, extracted public profile links, and created this brain page. [Source: filesystem search and PDF extraction, 2026-07-09]
- **2026-07-17** | Arvya internship experience update - Added onboarding, Outlook activity, Ask Arvya citation, retrieval, UI, debugging, and test work completed on `agent-onboarding-setup-progress`. [Source: branch history, working diff, and implementation session, 2026-07-17]
