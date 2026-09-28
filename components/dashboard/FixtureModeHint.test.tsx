import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { queryByText } from "@testing-library/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FixtureModeHint } from "./FixtureModeHint";

// `act()` is a no-op warning without this flag; React 19 sets it in real
// renderers only.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const useDashboard = vi.hoisted(() => vi.fn());

vi.mock("@/components/dashboard/DashboardProvider", () => ({
  useDashboard: () => useDashboard(),
}));

/** Render the hint into a detached container and return the container. */
async function render(): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<FixtureModeHint />);
  });
  return { container, root };
}

function setDashboardState(
  overrides: Partial<{
    isError: boolean;
    error: Error | null;
    isFetching: boolean;
  }> = {},
) {
  useDashboard.mockReturnValue({
    isError: true,
    error: new Error("Live activity data is unavailable."),
    isFetching: false,
    refetch: vi.fn(async () => undefined),
    ...overrides,
  });
}

const env = process.env as unknown as Record<string, string | undefined>;

let originalNodeEnv: string | undefined;
let originalVercelEnv: string | undefined;
const roots: Root[] = [];

beforeEach(() => {
  useDashboard.mockReset();
  originalNodeEnv = env.NODE_ENV;
  originalVercelEnv = env.VERCEL_ENV;
  delete env.VERCEL_ENV;
});

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => {
      root.unmount();
    });
  }
  document.body.innerHTML = "";
  env.NODE_ENV = originalNodeEnv;
  if (originalVercelEnv === undefined) {
    delete env.VERCEL_ENV;
  } else {
    env.VERCEL_ENV = originalVercelEnv;
  }
});

describe("FixtureModeHint", () => {
  it("shows fixture onboarding steps in development when activity fails", async () => {
    env.NODE_ENV = "development";
    setDashboardState();

    const { container, root } = await render();
    roots.push(root);

    expect(container.querySelector('[data-testid="fixture-mode-hint"]')).not.toBeNull();
    expect(
      queryByText(container, /Live data failed — you can keep working with fixture data/),
    ).not.toBeNull();
    expect(queryByText(container, /LUMENMAP_DATA_SOURCE=fixture/)).not.toBeNull();
    expect(queryByText(container, /Retry live data/)).not.toBeNull();
  });

  it("renders nothing in a production build even when activity fails", async () => {
    env.NODE_ENV = "production";
    setDashboardState();

    const { container, root } = await render();
    roots.push(root);

    expect(container.querySelector('[data-testid="fixture-mode-hint"]')).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("renders nothing when VERCEL_ENV is production", async () => {
    env.NODE_ENV = "development";
    env.VERCEL_ENV = "production";
    setDashboardState();

    const { container, root } = await render();
    roots.push(root);

    expect(container.querySelector('[data-testid="fixture-mode-hint"]')).toBeNull();
  });

  it("renders nothing when activity succeeds in development", async () => {
    env.NODE_ENV = "development";
    setDashboardState({ isError: false, error: null });

    const { container, root } = await render();
    roots.push(root);

    expect(container.querySelector('[data-testid="fixture-mode-hint"]')).toBeNull();
  });

  it("links to the CONTRIBUTING fixture-mode section", async () => {
    env.NODE_ENV = "development";
    setDashboardState();

    const { container, root } = await render();
    roots.push(root);

    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toContain("CONTRIBUTING.md#fixture-mode");
    expect(link?.getAttribute("rel")).toContain("noreferrer");
  });
});
