/**
 * Lightweight HTML → React Native renderer, shared by any screen that needs
 * to display admin-authored rich text (content pages, T&C, agreements).
 * Handles: h1, h2, h3, p, ul, ol, li, strong, em, a, br.
 * Strips any unrecognised tags while preserving their text content.
 *
 * Admin-authored content is frequently pasted straight out of Microsoft
 * Word, which wraps nearly everything in <span style="..."> for font/color
 * and inserts empty <o:p></o:p> paragraph markers. Those must be unwrapped
 * (not just left for the inline-tag scanner to trip over) or their raw tag
 * text leaks into the rendered output — see stripInlineTags below.
 */

import React from "react";
import { View, Text, StyleSheet, Linking } from "react-native";

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"');
}

// Word wraps almost everything in <span style="..."> purely for font/color,
// which we don't render — unwrap it, keeping inner content. <o:p> is a Word
// paragraph-end marker with no real content of its own — drop it entirely.
function unwrapWordArtifacts(html: string): string {
  return html
    .replace(/<\/?span[^>]*>/gi, "")
    .replace(/<o:p>[\s\S]*?<\/o:p>/gi, "")
    .replace(/<o:p\s*\/?>/gi, "");
}

function stripInlineTags(html: string): Array<{ text: string; bold: boolean; italic: boolean; href?: string }> {
  const cleaned = unwrapWordArtifacts(html);
  const parts: Array<{ text: string; bold: boolean; italic: boolean; href?: string }> = [];
  // The final `<[^>]+>` alternative is load-bearing: without it, any tag not
  // explicitly recognised here (a stray <u>, a malformed nested tag, etc.)
  // can't be matched by any alternative, so the global regex scan silently
  // skips just the leading "<" and resumes at the next character — leaking
  // the rest of the tag ("o:p>", "span style=\"...\">") into the rendered
  // text as if it were plain content. Matching-and-discarding it here keeps
  // that from ever leaking through.
  const regex = /<(strong|b)>([\s\S]*?)<\/(strong|b)>|<(em|i)>([\s\S]*?)<\/(em|i)>|<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>|<[^>]+>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(cleaned)) !== null) {
    if (m[1])      parts.push({ text: decodeEntities((m[2] || "").replace(/<[^>]+>/g, "")), bold: true,  italic: false });
    else if (m[4]) parts.push({ text: decodeEntities((m[5] || "").replace(/<[^>]+>/g, "")), bold: false, italic: true });
    else if (m[7]) parts.push({ text: decodeEntities((m[8] || "").replace(/<[^>]+>/g, "")), bold: false, italic: false, href: m[7] });
    else if (m[9]) {
      const txt = decodeEntities(m[9]).replace(/<br\s*\/?>/gi, "\n");
      if (txt.trim()) parts.push({ text: txt, bold: false, italic: false });
    }
    // else: matched the `<[^>]+>` catch-all — a tag we don't render specially
    // (e.g. leftover <u>, <font>), correctly consumed and discarded.
  }
  return parts;
}

function InlineContent({ parts }: { parts: ReturnType<typeof stripInlineTags> }) {
  return (
    <Text>
      {parts.map((p, i) => {
        const style = [
          p.bold   ? hs.bold   : undefined,
          p.italic ? hs.italic : undefined,
          p.href   ? hs.link   : undefined,
        ].filter(Boolean);
        return (
          <Text key={i} style={style} onPress={p.href ? () => Linking.openURL(p.href!) : undefined}>
            {p.text}
          </Text>
        );
      })}
    </Text>
  );
}

interface Block { type: "h1" | "h2" | "h3" | "p" | "li" | "br"; content: string; ordered?: boolean; index?: number }

function parseHtmlBlocks(html: string): Block[] {
  if (!html) return [];
  const blocks: Block[] = [];
  const normalised = html.replace(/\r\n|\r/g, "\n").replace(/&nbsp;/g, " ").replace(/<br\s*\/?>/gi, "\n");
  const blockRe = /<(h1|h2|h3|p|ul|ol|li)([^>]*)>([\s\S]*?)<\/\1>|(<br\s*\/?>)/gi;
  let match: RegExpExecArray | null;
  const liCounter: Record<string, number> = {};

  while ((match = blockRe.exec(normalised)) !== null) {
    if (match[4]) { blocks.push({ type: "br", content: "" }); continue; }
    const tag  = match[1]?.toLowerCase() as string;
    const body = match[3] || "";

    if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "p") {
      const clean = body.replace(/<[^>]+>/g, "").trim();
      if (clean) blocks.push({ type: tag as "h1" | "h2" | "h3" | "p", content: body.trim() });
    } else if (tag === "ul" || tag === "ol") {
      const ordered = tag === "ol";
      const listKey = match.index!.toString();
      liCounter[listKey] = 0;
      const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let liMatch: RegExpExecArray | null;
      while ((liMatch = liRe.exec(body)) !== null) {
        liCounter[listKey]++;
        blocks.push({ type: "li", content: liMatch[1].trim(), ordered, index: liCounter[listKey] });
      }
    } else if (tag === "li") {
      blocks.push({ type: "li", content: body.trim(), ordered: false });
    }
  }
  return blocks;
}

function ContentBlock({ block }: { block: Block }) {
  if (block.type === "br") return <View style={{ height: 8 }} />;
  const parts = stripInlineTags(block.content);

  if (block.type === "h1") return <Text style={hs.h1}><InlineContent parts={parts} /></Text>;
  if (block.type === "h2") return <Text style={hs.h2}><InlineContent parts={parts} /></Text>;
  if (block.type === "h3") return <Text style={hs.h3}><InlineContent parts={parts} /></Text>;
  if (block.type === "li") {
    const bullet = block.ordered ? `${block.index}.` : "•";
    return (
      <View style={hs.liRow}>
        <Text style={hs.bullet}>{bullet}</Text>
        <Text style={hs.liText}><InlineContent parts={parts} /></Text>
      </View>
    );
  }
  return <Text style={hs.paragraph}><InlineContent parts={parts} /></Text>;
}

/** Renders admin-authored HTML content with real formatting (headings, lists, bold/italic, links). */
export function HtmlContent({ html }: { html?: string }) {
  if (!html) return null;
  return <>{parseHtmlBlocks(html).map((block, i) => <ContentBlock key={i} block={block} />)}</>;
}

const hs = StyleSheet.create({
  bold:   { fontWeight: "700" },
  italic: { fontStyle: "italic" },
  link:   { color: "#f97316", textDecorationLine: "underline" },
  h1:     { fontSize: 19, fontWeight: "900", color: "#111827", marginTop: 24, marginBottom: 10, borderTopWidth: 1, borderTopColor: "#f3f4f6", paddingTop: 16 },
  h2:     { fontSize: 17, fontWeight: "800", color: "#111827", marginTop: 20, marginBottom: 8 },
  h3:     { fontSize: 15, fontWeight: "700", color: "#374151", marginTop: 16, marginBottom: 6 },
  paragraph: { fontSize: 14, lineHeight: 22, color: "#4b5563", marginBottom: 10 },
  liRow:  { flexDirection: "row", gap: 8, marginBottom: 6 },
  bullet: { fontSize: 14, color: "#9ca3af", width: 18, paddingTop: 2, fontWeight: "600" },
  liText: { flex: 1, fontSize: 14, lineHeight: 22, color: "#4b5563" },
});
