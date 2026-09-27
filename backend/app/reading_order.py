"""Conservative spatial ordering for common one- and two-column lecture layouts."""
import re


def pair_number_labels(items, page_width):
    """Keep an isolated number with a nearby same-row heading before sorting."""
    remaining = list(items)
    paired = []
    for label in items:
        if not any(item is label for item in remaining) or not re.fullmatch(r"\d{1,2}[.)]?", label.get("text", "").strip()):
            continue
        x0, y0, x1, y1 = label["bbox"]
        candidates = []
        for heading in remaining:
            if (heading is label or "\n" in heading.get("text", "") or
                    not heading.get("text", "").strip() or
                    re.fullmatch(r"\d{1,2}[.)]?", heading["text"].strip())):
                continue
            hx0, hy0, _, hy1 = heading["bbox"]
            overlap = min(y1, hy1) - max(y0, hy0)
            if x1 <= hx0 and hx0 - x1 < page_width * .12 and overlap > min(y1-y0, hy1-hy0) * .35:
                candidates.append((hx0 - x1, heading))
        if not candidates:
            continue
        heading = min(candidates, key=lambda pair: pair[0])[1]
        remaining = [item for item in remaining if item is not label and item is not heading]
        merged = dict(label)
        merged["text"] = f"{label['text'].strip()} {heading['text'].strip()}"
        merged["bbox"] = [min(x0, heading["bbox"][0]), min(y0, heading["bbox"][1]),
                          max(x1, heading["bbox"][2]), max(y1, heading["bbox"][3])]
        if "blocks" in label or "blocks" in heading:
            merged["blocks"] = label.get("blocks", []) + heading.get("blocks", [])
        paired.append(merged)
    return remaining + paired


def order_items(items, page_width, page_height):
    """Keep shape/block contents intact; reorder only when two clear columns exist."""
    positioned = [item for item in items if item.get("text", "").strip()]
    if not positioned:
        return []
    midpoint = page_width / 2
    narrow = [item for item in positioned if item["bbox"][2] - item["bbox"][0] < page_width * .55]
    left = [item for item in narrow if (item["bbox"][0] + item["bbox"][2]) / 2 < midpoint]
    right = [item for item in narrow if (item["bbox"][0] + item["bbox"][2]) / 2 >= midpoint]
    by_position = lambda item: (item["bbox"][1], item["bbox"][0])
    if len(left) < 3 or len(right) < 3:
        return sorted(positioned, key=by_position)
    left_top, right_top = min(item["bbox"][1] for item in left), min(item["bbox"][1] for item in right)
    left_bottom, right_bottom = max(item["bbox"][3] for item in left), max(item["bbox"][3] for item in right)
    # A shallow horizontal timeline has items on both sides, but is not a
    # two-column reading layout.
    if max(left_bottom, right_bottom) - min(left_top, right_top) < page_height * .20:
        return sorted(positioned, key=by_position)
    overlap = min(left_bottom, right_bottom) - max(left_top, right_top)
    shorter = min(left_bottom - left_top, right_bottom - right_top)
    if shorter <= 0 or overlap < shorter * .5:
        return sorted(positioned, key=by_position)
    body_start = max(left_top, right_top)
    body_end = min(left_bottom, right_bottom)
    margin = page_height * .025
    headers = [item for item in positioned if item["bbox"][3] < body_start - margin]
    footers = [item for item in positioned if item["bbox"][1] > body_end + margin]
    core_left = [item for item in left if item not in headers and item not in footers]
    core_right = [item for item in right if item not in headers and item not in footers]
    # Distinct horizontal bands distinguish columns from a side callout.
    if (not core_left or not core_right or
            max(item["bbox"][2] for item in core_left) >=
            min(item["bbox"][0] for item in core_right) - page_width * .02):
        return sorted(positioned, key=by_position)
    remaining = [item for item in positioned if item not in headers and item not in footers]
    left_body = [item for item in remaining if (item["bbox"][0] + item["bbox"][2]) / 2 < midpoint]
    right_body = [item for item in remaining if item not in left_body]
    return sorted(headers, key=by_position) + sorted(left_body, key=by_position) + \
        sorted(right_body, key=by_position) + sorted(footers, key=by_position)


def text_lines(items, page_width):
    """Join adjacent numeric labels to nearby text on the same visual row."""
    lines = []
    index = 0
    while index < len(items):
        item = items[index]
        value = item["text"].strip()
        if re.fullmatch(r"\d{1,2}[.)]?", value) and index + 1 < len(items):
            following = items[index + 1]
            x0, y0, x1, y1 = item["bbox"]
            nx0, ny0, _, ny1 = following["bbox"]
            overlap = min(y1, ny1) - max(y0, ny0)
            if (following["text"].strip() and "\n" not in following["text"] and
                    x0 <= nx0 and max(0, nx0 - x1) < page_width * .12 and
                    overlap > min(y1 - y0, ny1 - ny0) * .35):
                lines.append(f"{value} {following['text'].strip()}")
                index += 2
                continue
        lines.append(value)
        index += 1
    return [line for line in lines if line]
