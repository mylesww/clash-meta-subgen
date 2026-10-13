import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const fields = {
  config: "https://example.com/config.yaml?key=a+b&v=2",
  extra: "https://example.com/extra.yaml",
  token: " token+&中文%2B ",
};

const subscriptions = [
  "https://upstream.example/a?key=a+b&path=%2F订阅",
  "https://upstream.example/b",
  "https://upstream.example/b",
];

function queryWithSubscriptions() {
  const params = new URLSearchParams(fields);
  for (const subscription of subscriptions) params.append("subs", subscription);
  return params;
}

function inputValue(label: string) {
  return (screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement).value;
}

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
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
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
    expect(confirm).not.toHaveBeenCalled();

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
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();
    await user.click(screen.getByRole("button", { name: "生成订阅链接" }));
    expect(confirm).not.toHaveBeenCalled();
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

  it.each(["", "   "])("requires confirmation to generate without a token: %j", async (token) => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage(`/?${new URLSearchParams({ ...fields, token })}`);
    const tokenInput = screen.getByLabelText("访问令牌") as HTMLInputElement;
    expect(tokenInput.required).toBe(false);

    await user.click(screen.getByRole("button", { name: "生成订阅链接" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("未填写访问令牌（token）"));
    expect(screen.queryByLabelText("生成的订阅链接")).toBeNull();
    expect(tokenInput.getAttribute("aria-invalid")).toBe("false");

    confirm.mockReturnValue(true);
    tokenInput.focus();
    await user.keyboard("{Enter}");
    expect(confirm).toHaveBeenCalledTimes(2);
    const output = inputValue("生成的订阅链接");
    expect(Object.fromEntries(new URL(output).searchParams)).toEqual({
      config: fields.config,
      extra: fields.extra,
    });

    fireEvent.change(screen.getByLabelText("已有订阅链接"), { target: { value: output } });
    await user.click(screen.getByRole("button", { name: "解析并回填" }));
    expect(inputValue("订阅配置")).toBe(fields.config);
    expect(inputValue("基础配置")).toBe(fields.extra);
    expect(inputValue("访问令牌")).toBe("");
    expect(screen.getByLabelText("已有订阅链接").getAttribute("aria-invalid")).toBe("false");
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

describe("unified subscription form", () => {
  it("includes query-prefilled subscriptions in the single generate action and allows clearing them", async () => {
    const user = userEvent.setup();
    renderPage(`/?${queryWithSubscriptions()}`);
    expect(screen.getAllByRole("button", { name: /生成.*链接/ })).toHaveLength(1);
    expect(screen.queryByRole("navigation", { name: "订阅工具" })).toBeNull();
    expect(inputValue("额外订阅链接")).toBe(subscriptions.join("\n"));
    await user.click(screen.getByRole("button", { name: "生成订阅链接" }));
    let url = new URL(inputValue("生成的订阅链接"));
    expect(url.searchParams.getAll("subs")).toEqual(subscriptions);
    await user.clear(screen.getByLabelText("额外订阅链接"));
    expect(screen.queryByLabelText("生成的订阅链接")).toBeNull();
    await user.click(screen.getByRole("button", { name: "生成订阅链接" }));
    url = new URL(inputValue("生成的订阅链接"));
    expect(url.searchParams.has("subs")).toBe(false);
    expect(url.searchParams.get("token")).toBe(fields.token);
  });

  it("shows the invalid subscription line without exposing an actionable result", async () => {
    const user = userEvent.setup();
    renderPage(`/?${new URLSearchParams(fields)}`);
    fireEvent.change(screen.getByLabelText("额外订阅链接"), {
      target: { value: "https://example.com/a\n\ninvalid" },
    });
    await user.click(screen.getByRole("button", { name: "生成订阅链接" }));
    expect(screen.getByText("第 3 行：请输入完整、有效的 URL")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("额外订阅链接"));
    expect(screen.queryByRole("link", { name: "打开链接" })).toBeNull();
  });

});

describe("importing previous links", () => {
  it("only restores on request, clears stale results and regenerates edited fields with subscriptions", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderPage(`/?${new URLSearchParams({ ...fields, config: "https://current.example/config" })}`);
    await user.click(screen.getByRole("button", { name: "生成订阅链接" }));
    const previousOutput = inputValue("生成的订阅链接");
    await user.click(screen.getByRole("button", { name: "显示访问令牌" }));

    const oldLink = `https://old.example/custom/sub?${queryWithSubscriptions()}`;
    await user.click(screen.getByLabelText("已有订阅链接"));
    await user.paste(oldLink);
    expect(inputValue("订阅配置")).toBe("https://current.example/config");
    expect(inputValue("额外订阅链接")).toBe("");
    expect(inputValue("生成的订阅链接")).toBe(previousOutput);

    await user.click(screen.getByRole("button", { name: "解析并回填" }));
    expect(inputValue("订阅配置")).toBe(fields.config);
    expect(inputValue("基础配置")).toBe(fields.extra);
    expect(inputValue("访问令牌")).toBe(fields.token);
    expect(inputValue("额外订阅链接")).toBe(subscriptions.join("\n"));
    expect((screen.getByLabelText("访问令牌") as HTMLInputElement).type).toBe("password");
    expect(document.activeElement).toBe(screen.getByLabelText("订阅配置"));
    expect(screen.queryByLabelText("生成的订阅链接")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("已回填配置，可继续编辑并生成订阅链接。");
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("订阅配置"), {
      target: { value: "https://updated.example/config?key=a+b&v=2" },
    });
    await user.click(screen.getByRole("button", { name: "生成订阅链接" }));
    const result = new URL(inputValue("生成的订阅链接"));
    expect(result.origin + result.pathname).toBe(`${window.location.origin}/sub`);
    expect(result.searchParams.get("config")).toBe("https://updated.example/config?key=a+b&v=2");
    expect(result.searchParams.get("token")).toBe(fields.token);
    expect(result.searchParams.getAll("subs")).toEqual(subscriptions);
  });

  it("imports with Enter, clears validation errors and replaces missing subs with an empty field", async () => {
    const user = userEvent.setup();
    renderPage("/?subs=invalid");
    await user.click(screen.getByRole("button", { name: "生成订阅链接" }));
    expect(screen.getByLabelText("订阅配置").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("额外订阅链接").getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(screen.getByLabelText("已有订阅链接"), {
      target: { value: `https://old.example/sub?${new URLSearchParams(fields)}` },
    });
    screen.getByLabelText("已有订阅链接").focus();
    await user.keyboard("{Enter}");
    expect(inputValue("额外订阅链接")).toBe("");
    for (const label of ["订阅配置", "基础配置", "访问令牌", "额外订阅链接"]) {
      expect(screen.getByLabelText(label).getAttribute("aria-invalid")).toBe("false");
    }
    expect(screen.queryByLabelText("生成的订阅链接")).toBeNull();
    await user.click(screen.getByRole("button", { name: "生成订阅链接" }));
    expect(new URL(inputValue("生成的订阅链接")).searchParams.has("subs")).toBe(false);
  });

  it.each(["invalid", "https://old.example/sub?config=c"])(
    "keeps the current form and result when importing fails: %s",
    async (link) => {
      const user = userEvent.setup();
      renderPage(`/?${queryWithSubscriptions()}`);
      await user.click(screen.getByRole("button", { name: "生成订阅链接" }));
      const output = inputValue("生成的订阅链接");
      fireEvent.change(screen.getByLabelText("已有订阅链接"), { target: { value: link } });
      await user.click(screen.getByRole("button", { name: "解析并回填" }));
      expect(screen.getByLabelText("已有订阅链接").getAttribute("aria-invalid")).toBe("true");
      expect(document.activeElement).toBe(screen.getByLabelText("已有订阅链接"));
      expect(inputValue("订阅配置")).toBe(fields.config);
      expect(inputValue("基础配置")).toBe(fields.extra);
      expect(inputValue("访问令牌")).toBe(fields.token);
      expect(inputValue("额外订阅链接")).toBe(subscriptions.join("\n"));
      expect(inputValue("生成的订阅链接")).toBe(output);
      await user.clear(screen.getByLabelText("已有订阅链接"));
      expect(screen.getByLabelText("已有订阅链接").getAttribute("aria-invalid")).toBe("false");
    },
  );
});

describe("legacy entry and routing", () => {
  it.each(["/append-subs", "/append-subs/", "/APPEND-SUBS"])(
    "renders the unified form at %s",
    (path) => {
      renderPage(path);
      expect(screen.getByRole("heading", { name: "一份链接，连接所有节点。" })).toBeTruthy();
      expect(screen.getByLabelText("已有订阅链接")).toBeTruthy();
      expect(screen.getByLabelText("订阅配置")).toBeTruthy();
      expect(screen.getByLabelText("额外订阅链接")).toBeTruthy();
      expect(screen.getAllByRole("button", { name: /生成.*链接/ })).toHaveLength(1);
      expect(document.title).toBe("Clash Meta · 订阅生成");
    },
  );

  it.each([
    { overrides: [], expected: subscriptions },
    { overrides: ["https://new.example/a", "https://new.example/b"], expected: ["https://new.example/a", "https://new.example/b"] },
    { overrides: [""], expected: [] },
  ])("prefills baseLink and applies explicit subscription overrides: $overrides", async ({ overrides, expected }) => {
    const user = userEvent.setup();
    const baseLink = `https://old.example/sub?${queryWithSubscriptions()}`;
    const params = new URLSearchParams({ baseLink });
    for (const subscription of overrides) params.append("subs", subscription);
    renderPage(`/append-subs?${params}`);
    expect(inputValue("已有订阅链接")).toBe(baseLink);
    expect(inputValue("订阅配置")).toBe(fields.config);
    expect(inputValue("基础配置")).toBe(fields.extra);
    expect(inputValue("访问令牌")).toBe(fields.token);
    expect(inputValue("额外订阅链接")).toBe(expected.join("\n"));
    await user.click(screen.getByRole("button", { name: "生成订阅链接" }));
    const result = new URL(inputValue("生成的订阅链接"));
    expect(result.origin).toBe(window.location.origin);
    expect(result.searchParams.getAll("subs")).toEqual(expected);
  });

  it("reports an invalid legacy baseLink and allows manual configuration", async () => {
    const user = userEvent.setup();
    renderPage("/append-subs?baseLink=invalid&subs=https%3A%2F%2Fupstream.example%2Fa");
    expect(screen.getByText("请输入完整、有效的 URL")).toBeTruthy();
    expect(inputValue("订阅配置")).toBe("");
    expect(inputValue("额外订阅链接")).toBe("https://upstream.example/a");
    fillSubscription();
    await user.click(screen.getByRole("button", { name: "生成订阅链接" }));
    expect(screen.getByLabelText("生成的订阅链接")).toBeTruthy();
  });

  it("restores query prefills on query changes, back and forward", async () => {
    const user = userEvent.setup();
    const router = renderPage(`/?${queryWithSubscriptions()}`);
    await user.click(screen.getByRole("button", { name: "生成订阅链接" }));
    await act(() => router.navigate(`/?${new URLSearchParams({ ...fields, token: "changed" })}`));
    expect(inputValue("访问令牌")).toBe("changed");
    expect(inputValue("额外订阅链接")).toBe("");
    expect(screen.queryByLabelText("生成的订阅链接")).toBeNull();
    await act(() => router.navigate(-1));
    await waitFor(() => expect(inputValue("访问令牌")).toBe(fields.token));
    expect(inputValue("额外订阅链接")).toBe(subscriptions.join("\n"));
    await act(() => router.navigate(1));
    await waitFor(() => expect(inputValue("访问令牌")).toBe("changed"));
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
