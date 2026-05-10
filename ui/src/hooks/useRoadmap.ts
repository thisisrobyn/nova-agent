import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';
const GH_TOKEN = import.meta.env.VITE_GITHUB_TOKEN || '';
const GH_OWNER = import.meta.env.VITE_GITHUB_PROJECT_OWNER || 'thisisrober';
const GH_PROJECT = Number(import.meta.env.VITE_GITHUB_PROJECT_NUMBER || '3');

/* ─── Types ─── */

export interface RoadmapLabel {
  name: string;
  color: string;
}

export interface RoadmapIssue {
  title: string;
  number: number | null;
  url: string | null;
  state: string | null;
  status: string | null;
  priority: string | null;
  size: string | null;
  labels: RoadmapLabel[];
}

export interface RoadmapIteration {
  id: string;
  title: string;
  start_date: string | null;
  duration: number | null;
  items: RoadmapIssue[];
}

export interface RoadmapData {
  project_title: string;
  project_description: string | null;
  project_url: string;
  iterations: RoadmapIteration[];
  backlog: RoadmapIssue[];
}

/* ─── GraphQL query (same as backend) ─── */

const PROJECT_QUERY = `
query($owner: String!, $number: Int!) {
  user(login: $owner) {
    projectV2(number: $number) {
      title
      shortDescription
      url
      fields(first: 30) {
        nodes {
          ... on ProjectV2IterationField {
            id
            name
            configuration {
              iterations { id title startDate duration }
              completedIterations { id title startDate duration }
            }
          }
        }
      }
      items(first: 100) {
        nodes {
          fieldValues(first: 12) {
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field { ... on ProjectV2SingleSelectField { name } }
              }
              ... on ProjectV2ItemFieldIterationValue {
                title
                startDate
                duration
                iterationId
                field { ... on ProjectV2IterationField { name } }
              }
            }
          }
          content {
            ... on Issue {
              title
              number
              url
              state
              labels(first: 10) {
                nodes { name color }
              }
            }
            ... on DraftIssue {
              title
            }
          }
        }
      }
    }
  }
}`;

/* ─── Parse GraphQL response into RoadmapData ─── */

function parseGraphQLResponse(data: Record<string, unknown>): RoadmapData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const project = (data as any).data.user.projectV2;

  // Build iteration map
  const iterationMap = new Map<string, RoadmapIteration>();
  for (const field of project.fields.nodes) {
    if (!field?.configuration) continue;
    const allIterations = [
      ...(field.configuration.iterations || []),
      ...(field.configuration.completedIterations || []),
    ];
    for (const it of allIterations) {
      iterationMap.set(it.id, {
        id: it.id,
        title: it.title,
        start_date: it.startDate ?? null,
        duration: it.duration ?? null,
        items: [],
      });
    }
  }

  const backlog: RoadmapIssue[] = [];

  for (const item of project.items.nodes) {
    const content = item?.content;
    if (!content?.title) continue;

    const labels: RoadmapLabel[] = (content.labels?.nodes || []).map(
      (l: { name: string; color: string }) => ({ name: l.name, color: l.color }),
    );

    let status: string | null = null;
    let priority: string | null = null;
    let size: string | null = null;
    let iterationId: string | null = null;

    for (const fv of item.fieldValues?.nodes || []) {
      if (!fv?.field) continue;
      const fieldName = fv.field.name || '';
      if (fieldName === 'Status') status = fv.name ?? null;
      else if (fieldName === 'Priority') priority = fv.name ?? null;
      else if (fieldName === 'Size') size = fv.name ?? null;
      else if (fieldName === 'Iteration') iterationId = fv.iterationId ?? null;
    }

    const issue: RoadmapIssue = {
      title: content.title,
      number: content.number ?? null,
      url: content.url ?? null,
      state: content.state ?? null,
      status,
      priority,
      size,
      labels,
    };

    if (iterationId && iterationMap.has(iterationId)) {
      iterationMap.get(iterationId)!.items.push(issue);
    } else {
      backlog.push(issue);
    }
  }

  const sortedIterations = Array.from(iterationMap.values()).sort(
    (a, b) => (a.start_date || '').localeCompare(b.start_date || ''),
  );

  return {
    project_title: project.title || '',
    project_description: project.shortDescription ?? null,
    project_url: project.url || '',
    iterations: sortedIterations,
    backlog,
  };
}

/* ─── GitHub REST API fallback types ─── */

interface GitHubRESTIssue {
  title: string;
  number: number;
  html_url: string;
  state: string;
  labels: { name: string; color: string }[];
  pull_request?: unknown;
}

/* ─── Hook ─── */

export function useRoadmap() {
  const [data, setData] = useState<RoadmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchRoadmap() {
      setLoading(true);
      setError(null);

      // ── Layer 1: Try backend proxy (full Projects V2 data) ──
      try {
        const res = await fetch(`${API_BASE}/api/v1/github/roadmap`);
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) { setData(json); setLoading(false); }
          return;
        }
      } catch {
        // Backend not available, try next layer
      }

      // ── Layer 2: Call GitHub GraphQL API directly (needs VITE_GITHUB_TOKEN) ──
      if (GH_TOKEN) {
        try {
          const res = await fetch('https://api.github.com/graphql', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${GH_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: PROJECT_QUERY,
              variables: { owner: GH_OWNER, number: GH_PROJECT },
            }),
          });
          if (res.ok) {
            const json = await res.json();
            if (!json.errors) {
              const parsed = parseGraphQLResponse(json);
              if (!cancelled) { setData(parsed); setLoading(false); }
              return;
            }
          }
        } catch {
          // GraphQL call failed, try next layer
        }
      }

      // ── Layer 3: Fallback to GitHub REST API (public, no auth, no iterations) ──
      try {
        const res = await fetch(
          `https://api.github.com/repos/${GH_OWNER}/nova-agent/issues?state=all&per_page=100`,
          { headers: { Accept: 'application/vnd.github.v3+json' } },
        );
        if (!res.ok) throw new Error(`GitHub API: ${res.status}`);
        const issues: GitHubRESTIssue[] = await res.json();

        const realIssues = issues.filter((i) => !i.pull_request);

        const mappedIssues: RoadmapIssue[] = realIssues.map((i) => ({
          title: i.title,
          number: i.number,
          url: i.html_url,
          state: i.state,
          status: i.state === 'open' ? 'Open' : 'Done',
          priority: null,
          size: null,
          labels: i.labels.map((l) => ({ name: l.name, color: l.color })),
        }));

        if (!cancelled) {
          setData({
            project_title: 'NOVA — Neural Orchestration & Virtual Agent',
            project_description: null,
            project_url: `https://github.com/users/${GH_OWNER}/projects/${GH_PROJECT}/views/1`,
            iterations: [],
            backlog: mappedIssues,
          });
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load roadmap');
          setLoading(false);
        }
      }
    }

    fetchRoadmap();
    return () => { cancelled = true; };
  }, []);

  return { data, loading, error };
}
