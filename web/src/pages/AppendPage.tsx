import { useState, type FormEvent } from "react";
import { useLocation } from "react-router";
import { Field } from "../components/Field";
import { Icon } from "../components/Icon";
import { ResultPanel } from "../components/ResultPanel";
import {
  readAppendValues,
  replaceSubscriptions,
  type AppendValues,
  type FieldErrors,
} from "../lib/links";

export function AppendPage() {
  const { search } = useLocation();
  const [values, setValues] = useState(() => readAppendValues(search));
  const [errors, setErrors] = useState<FieldErrors<AppendValues>>({});
  const [url, setUrl] = useState<string | null>(null);

  function update(field: keyof AppendValues, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
    setUrl(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = replaceSubscriptions(values);
    if (!result.ok) {
      setErrors(result.errors);
      setUrl(null);
      const field = Object.keys(result.errors)[0];
      (
        event.currentTarget.elements.namedItem(field) as
          HTMLInputElement | HTMLTextAreaElement
      )?.focus();
      return;
    }
    setErrors({});
    setUrl(result.url);
  }

  return (
    <div className="workspace">
      <section className="form-panel" aria-labelledby="form-heading">
        <div className="panel-heading">
          <span className="step-number">01</span>
          <h2 id="form-heading">调整额外订阅</h2>
        </div>
        <p className="panel-description">
          沿用已有配置，为订阅链接补充节点来源。
        </p>
        <form noValidate onSubmit={submit}>
          <Field
            id="baseLink"
            label="原生成链接"
            parameter="baseLink"
            hint="粘贴已有的完整订阅生成链接。"
            error={errors.baseLink}
          >
            <input
              id="baseLink"
              name="baseLink"
              type="url"
              required
              placeholder="https://example.com/sub?config=…&extra=…&token=…"
              value={values.baseLink}
              onChange={(event) => update("baseLink", event.target.value)}
              aria-invalid={Boolean(errors.baseLink)}
              aria-describedby="baseLink-hint"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
          <Field
            id="subs"
            label="额外订阅链接"
            parameter="可选"
            hint="每行一个 HTTPS 链接；留空可清除原链接中的额外订阅。"
            error={errors.subs}
          >
            <textarea
              id="subs"
              name="subs"
              rows={5}
              placeholder={
                "https://example.com/sub-a\nhttps://example.com/sub-b"
              }
              value={values.subs}
              onChange={(event) => update("subs", event.target.value)}
              aria-invalid={Boolean(errors.subs)}
              aria-describedby="subs-hint"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
          <p className="form-note">
            新列表会替换原链接中的额外订阅，其他参数保持原样。
          </p>
          <button
            className="button button-primary generate-button"
            type="submit"
          >
            生成新链接
            <Icon name="arrow" />
          </button>
        </form>
      </section>
      <ResultPanel key={url ?? "empty"} url={url} />
    </div>
  );
}
