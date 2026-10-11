import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const fields = {
  config: "https://example.com/config.yaml?key=a+b&v=2",
  extra: "https://example.com/extra.yaml",
  token: "token+&中文",
};

function renderPage(path = "/") {
  const router = createMemoryRouter([{ path: "*", element: <App /> }], {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

function fillSubscription() {
  fireEvent.change(screen.getByLabelText("订阅配置"), {
    target: { value: fields.config },
  });
  fireEvent.change(screen.getByLabelText("基础配置"), {
    target: { value: fields.extra },
  });
  fireEvent.change(screen.getByLabelText("访问令牌"), {
    target: { value: fields.token },
  });
}

afterEach(() => vi.restoreAllMocks());

describe("subscription UI", () => {
  it("generates a link from query-prefilled fields, copies it and opens it safely", async () => {
    const user = userEvent.setup();
    const clipboard = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    renderPage(`/?${new URLSearchParams(fields)}`);

    expect((screen.getByLabelText("访问令牌") as HTMLInputElement).type).toBe(
      "password",
    );
    await user.click(screen.getByRole("button", { name: "显示访问令牌" }));
    expect((screen.getByLabelText("访问令牌") as HTMLInputElement).type).toBe(
      "text",
    );
    await user.click(screen.getByRole("button", { name: "生成订阅链接" }));

    const output = screen.getByLabelText(
      "生成的订阅链接",
    ) as HTMLTextAreaElement;
    const result = new URL(output.value);
    expect(result.origin).toBe(window.location.origin);
    expect(result.pathname).toBe("/sub");
    expect(Object.fromEntries(result.searchParams)).toEqual(fields);
    const open = screen.getByRole("link", { name: "打开链接" });
    expect(open.getAttribute("href")).toBe(output.value);
    expect(open.getAttribute("target")).toBe("_blank");
    expect(open.getAttribute("rel")).toBe("noopener noreferrer");
    await user.click(screen.getByRole("button", { name: "复制链接" }));
    expect(clipboard).toHaveBeenCalledWith(output.value);
    expect(screen.getByRole("button", { name: "已复制" })).toBeTruthy();
  });

  it("focuses invalid fields, supports keyboard submission and clears stale results when edited", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "生成订阅链接" }));
    expect(document.activeElement).toBe(screen.getByLabelText("订阅配置"));
    expect(screen.getByLabelText("订阅配置").getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(screen.queryByRole("link", { name: "打开链接" })).toBeNull();
    fillSubscription();
    screen.getByLabelText("访问令牌").focus();
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("生成的订阅链接")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("订阅配置"), {
      target: { value: "http://example.com/config.yaml" },
    });
    expect(screen.queryByLabelText("生成的订阅链接")).toBeNull();
    await user.click(screen.getByRole("button", { name: "生成订阅链接" }));
    expect(screen.getByText("链接须以 https:// 开头")).toBeTruthy();
  });

  it("selects the complete link for manual copying if the clipboard rejects access", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("denied"),
    );
    renderPage();
    fillSubscription();
    await user.click(screen.getByRole("button", { name: "生成订阅链接" }));
    await user.click(screen.getByRole("button", { name: "复制链接" }));
    const output = screen.getByLabelText(
      "生成的订阅链接",
    ) as HTMLTextAreaElement;
    expect(document.activeElement).toBe(output);
    expect(output.selectionStart).toBe(0);
    expect(output.selectionEnd).toBe(output.value.length);
    expect(
      screen.getByText("无法自动复制，已选中链接，请手动复制。"),
    ).toBeTruthy();
  });
});

describe("append UI and routing", () => {
  it.each(["/append-subs/", "/APPEND-SUBS"])("keeps layout and title consistent with router matching for %s", (path) => {
    renderPage(path);
    expect(screen.getByRole("heading", { name: "更多节点，一起连接。" })).toBeTruthy();
    expect(screen.getByLabelText("原生成链接")).toBeTruthy();
    expect(document.title).toBe("Clash Meta · 额外订阅");
  });

  it("prefills the append page, replaces existing subs and allows clearing them", async () => {
    const user = userEvent.setup();
    const params = new URLSearchParams({
      baseLink:
        "https://worker.example/sub?config=c&extra=e&token=t&subs=old#fragment",
    });
    params.append("subs", "https://upstream.example/a");
    params.append("subs", "https://upstream.example/b");
    renderPage(`/append-subs?${params}`);
    expect(
      (screen.getByLabelText("额外订阅链接") as HTMLTextAreaElement).value,
    ).toBe("https://upstream.example/a\nhttps://upstream.example/b");
    await user.click(screen.getByRole("button", { name: "生成新链接" }));
    let url = new URL(
      (screen.getByLabelText("生成的订阅链接") as HTMLTextAreaElement).value,
    );
    expect(url.searchParams.getAll("subs")).toEqual([
      "https://upstream.example/a",
      "https://upstream.example/b",
    ]);
    expect(url.hash).toBe("#fragment");
    await user.clear(screen.getByLabelText("额外订阅链接"));
    await user.click(screen.getByRole("button", { name: "生成新链接" }));
    url = new URL(
      (screen.getByLabelText("生成的订阅链接") as HTMLTextAreaElement).value,
    );
    expect(url.searchParams.has("subs")).toBe(false);
    expect(url.searchParams.get("token")).toBe("t");
  });

  it("shows the invalid subscription line without exposing an actionable result", async () => {
    const user = userEvent.setup();
    renderPage("/append-subs?baseLink=https%3A%2F%2Fworker.example%2Fsub");
    fireEvent.change(screen.getByLabelText("额外订阅链接"), {
      target: { value: "https://example.com/a\n\ninvalid" },
    });
    await user.click(screen.getByRole("button", { name: "生成新链接" }));
    expect(screen.getByText("第 3 行：请输入完整、有效的 URL")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("额外订阅链接"));
    expect(screen.queryByRole("link", { name: "打开链接" })).toBeNull();
  });

  it("navigates between routes and restores query prefills on back and forward", async () => {
    const user = userEvent.setup();
    const router = renderPage(`/?${new URLSearchParams(fields)}`);
    await user.click(screen.getByRole("link", { name: "额外订阅" }));
    expect(router.state.location.pathname).toBe("/append-subs");
    expect(screen.getByLabelText("原生成链接")).toBeTruthy();
    await router.navigate(-1);
    await waitFor(() =>
      expect(
        (screen.getByLabelText("访问令牌") as HTMLInputElement).value,
      ).toBe(fields.token),
    );
    await router.navigate(1);
    await waitFor(() =>
      expect(screen.getByLabelText("原生成链接")).toBeTruthy(),
    );
  });

  it.each(["/missing", "/append-subs.html"])(
    "shows the app not-found page for %s",
    async (path) => {
      const user = userEvent.setup();
      renderPage(path);
      expect(screen.getByRole("heading", { name: "页面不存在" })).toBeTruthy();
      await user.click(screen.getByRole("link", { name: "返回首页" }));
      expect(screen.getByLabelText("订阅配置")).toBeTruthy();
    },
  );
});
