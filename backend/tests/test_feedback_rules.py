import unittest
from unittest.mock import patch
from app.feedback import ConfusionRules, summarise


class ConfusionRulesTest(unittest.TestCase):
    def setUp(self):
        self.rules = ConfusionRules(threshold_percent=50, min_responses=2)

    def test_no_responses_and_one_response_do_not_flag(self):
        empty = summarise({}, self.rules)
        self.assertEqual(empty["total"], 0)
        self.assertEqual(empty["not_understand_percent"], 0)
        self.assertFalse(empty["flagged"])
        single = summarise({"first": "not_understand"}, self.rules)
        self.assertEqual(single["not_understand_percent"], 100)
        self.assertFalse(single["flagged"])

    def test_threshold_is_inclusive_and_reversible(self):
        equal = summarise({"first": "understand", "second": "not_understand"}, self.rules)
        self.assertEqual(equal["understand_percent"], 50)
        self.assertEqual(equal["not_understand_percent"], 50)
        self.assertTrue(equal["flagged"])
        changed = summarise({"first": "understand", "second": "understand"}, self.rules)
        self.assertEqual(changed["total"], 2)
        self.assertFalse(changed["flagged"])

    def test_configurable_threshold_and_minimum(self):
        rules = ConfusionRules(threshold_percent=75, min_responses=4)
        three = summarise({"a": "not_understand", "b": "not_understand", "c": "not_understand"}, rules)
        self.assertFalse(three["flagged"])
        four = summarise({"a": "not_understand", "b": "not_understand", "c": "not_understand", "d": "understand"}, rules)
        self.assertTrue(four["flagged"])

    def test_environment_configuration(self):
        with patch.dict("os.environ", {
            "CONFUSION_THRESHOLD_PERCENT": "75",
            "CONFUSION_MIN_RESPONSES": "4",
        }):
            self.assertEqual(ConfusionRules.from_environment(), ConfusionRules(75, 4))
        with patch.dict("os.environ", {"CONFUSION_MIN_RESPONSES": "0"}):
            with self.assertRaises(ValueError):
                ConfusionRules.from_environment()
