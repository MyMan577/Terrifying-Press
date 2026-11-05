package com.pressplay.media;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * BERT uncased WordPiece tokenizer (what all-MiniLM-L6-v2 uses), so the page never has to load transformers.js
 * or tokenize on the UI thread. Same steps as the Hugging Face BertNormalizer + BertPreTokenizer + WordPiece:
 * clean control characters, space out CJK characters, strip accents, lowercase, split on whitespace and punctuation,
 * then greedy longest-match WordPiece with the "##" continuation prefix. Pure Java, no Android classes.
 */
final class MiniTokenizer {
    private static final int MAX_WORD_CHARS = 100;
    private final Map<String, Integer> vocab;
    final int cls, sep, pad, unk;

    MiniTokenizer(Map<String, Integer> vocab) {
        this.vocab = vocab;
        this.cls = id("[CLS]", 101);
        this.sep = id("[SEP]", 102);
        this.pad = id("[PAD]", 0);
        this.unk = id("[UNK]", 100);
    }

    private int id(String tok, int dflt) { Integer v = vocab.get(tok); return v == null ? dflt : v; }

    /** [CLS] + word pieces + [SEP], cut to at most maxLen ids in total. */
    int[] encode(String text, int maxLen) {
        List<Integer> body = new ArrayList<>();
        int room = Math.max(0, maxLen - 2);
        for (String word : pretokenize(normalize(text))) {
            if (body.size() >= room) break;
            wordPiece(word, body);
        }
        int n = Math.min(body.size(), room);
        int[] out = new int[n + 2];
        out[0] = cls;
        for (int i = 0; i < n; i++) out[i + 1] = body.get(i);
        out[n + 1] = sep;
        return out;
    }

    // ---- normalizer: clean, space out CJK, strip accents, lowercase ----
    private static String normalize(String s) {
        StringBuilder b = new StringBuilder(s.length() + 8);
        for (int i = 0; i < s.length(); ) {
            int cp = s.codePointAt(i); i += Character.charCount(cp);
            if (cp == 0 || cp == 0xFFFD || isControl(cp)) continue;
            if (isWhitespace(cp)) { b.append(' '); continue; }
            if (isCjk(cp)) { b.append(' ').appendCodePoint(cp).append(' '); continue; }
            b.appendCodePoint(cp);
        }
        String d = Normalizer.normalize(b.toString(), Normalizer.Form.NFD);
        StringBuilder o = new StringBuilder(d.length());
        for (int i = 0; i < d.length(); ) {
            int cp = d.codePointAt(i); i += Character.charCount(cp);
            if (Character.getType(cp) == Character.NON_SPACING_MARK) continue;
            o.appendCodePoint(cp);
        }
        return o.toString().toLowerCase(Locale.ROOT);
    }

    // ---- pre-tokenizer: split on whitespace, every punctuation character stands alone ----
    private static List<String> pretokenize(String s) {
        List<String> out = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        for (int i = 0; i < s.length(); ) {
            int cp = s.codePointAt(i); i += Character.charCount(cp);
            if (isWhitespace(cp)) { if (cur.length() > 0) { out.add(cur.toString()); cur.setLength(0); } }
            else if (isPunct(cp)) {
                if (cur.length() > 0) { out.add(cur.toString()); cur.setLength(0); }
                out.add(new String(Character.toChars(cp)));
            } else cur.appendCodePoint(cp);
        }
        if (cur.length() > 0) out.add(cur.toString());
        return out;
    }

    // ---- WordPiece: longest match first; if any piece is missing the whole word is [UNK] ----
    private void wordPiece(String word, List<Integer> out) {
        int[] cps = word.codePoints().toArray();
        if (cps.length > MAX_WORD_CHARS) { out.add(unk); return; }
        List<Integer> pieces = new ArrayList<>();
        int start = 0;
        while (start < cps.length) {
            int end = cps.length, found = -1;
            while (start < end) {
                String sub = new String(cps, start, end - start);
                if (start > 0) sub = "##" + sub;
                Integer v = vocab.get(sub);
                if (v != null) { found = v; break; }
                end--;
            }
            if (found < 0) { out.add(unk); return; }
            pieces.add(found);
            start = end;
        }
        out.addAll(pieces);
    }

    private static boolean isWhitespace(int cp) {
        return cp == ' ' || cp == '\t' || cp == '\n' || cp == '\r' || Character.getType(cp) == Character.SPACE_SEPARATOR;
    }

    private static boolean isControl(int cp) {
        if (cp == '\t' || cp == '\n' || cp == '\r') return false;
        int t = Character.getType(cp);
        return t == Character.CONTROL || t == Character.FORMAT || t == Character.SURROGATE || t == Character.PRIVATE_USE || t == Character.UNASSIGNED;
    }

    private static boolean isPunct(int cp) {
        if ((cp >= 33 && cp <= 47) || (cp >= 58 && cp <= 64) || (cp >= 91 && cp <= 96) || (cp >= 123 && cp <= 126)) return true;
        switch (Character.getType(cp)) {
            case Character.CONNECTOR_PUNCTUATION: case Character.DASH_PUNCTUATION: case Character.START_PUNCTUATION:
            case Character.END_PUNCTUATION: case Character.INITIAL_QUOTE_PUNCTUATION: case Character.FINAL_QUOTE_PUNCTUATION:
            case Character.OTHER_PUNCTUATION: return true;
            default: return false;
        }
    }

    private static boolean isCjk(int cp) {
        return (cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF) || (cp >= 0x20000 && cp <= 0x2A6DF)
            || (cp >= 0x2A700 && cp <= 0x2B73F) || (cp >= 0x2B740 && cp <= 0x2B81F) || (cp >= 0x2B820 && cp <= 0x2CEAF)
            || (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0x2F800 && cp <= 0x2FA1F);
    }
}
