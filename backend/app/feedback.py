"""Classroom-wide feedback rules; no AI or individual-level inference."""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class ConfusionRules:
    threshold_percent: int = 50
    min_responses: int = 2

    @classmethod
    def from_environment(cls):
        threshold = int(os.getenv("CONFUSION_THRESHOLD_PERCENT", "50"))
        minimum = int(os.getenv("CONFUSION_MIN_RESPONSES", "2"))
        if not 0 <= threshold <= 100:
            raise ValueError("CONFUSION_THRESHOLD_PERCENT must be between 0 and 100")
        if minimum < 1:
            raise ValueError("CONFUSION_MIN_RESPONSES must be at least 1")
        return cls(threshold, minimum)


def summarise(responses, rules: ConfusionRules):
    understand = sum(choice == "understand" for choice in responses.values())
    not_understand = sum(choice == "not_understand" for choice in responses.values())
    total = understand + not_understand
    understand_percent = 100 * understand / total if total else 0
    not_understand_percent = 100 * not_understand / total if total else 0
    return {
        "understand": understand,
        "not_understand": not_understand,
        "total": total,
        "understand_percent": understand_percent,
        "not_understand_percent": not_understand_percent,
        "flagged": total >= rules.min_responses and not_understand_percent >= rules.threshold_percent,
    }
