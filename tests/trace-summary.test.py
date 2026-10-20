"""Validate presentation accounting independently of a live browser."""
import importlib.util
import json
import pathlib
import tempfile
import unittest
spec = importlib.util.spec_from_file_location('summary', pathlib.Path(__file__).with_name('summarize-render-trace.py'))
summary = importlib.util.module_from_spec(spec)
spec.loader.exec_module(summary)


class PresentationAccounting(unittest.TestCase):
    def test_window_counters_and_overlapping_trackers(self):
        events = []
        def event(name, phase, ts, args=None, track='1'):
            events.append({'name': name, 'ph': phase, 'ts': ts, 'pid': 1,
                           'id2': {'local': track}, 'args': args or {}})
        event('OCM-measured-start', 'R', 100)
        event('OCM-measured-end', 'R', 500)
        event('FrameSequenceTrackerV3', 'b', 0, {'name': 'JSAnimation'})
        def frame(start, end, expected, v3, v4, track='1'):
            event('Frame', 'b', start, {'data': {'values': {'expected': expected,
                  'dropped_v3': v3, 'dropped_v4': v4}}}, track)
            event('Frame', 'e', end, track=track)
        frame(0, 90, 5, 2, 1)  # Warmup is excluded but cumulative counters advance.
        frame(90, 120, 6, 2, 1)  # Straddles start; excluded.
        frame(120, 220, 9, 3, 1)  # Three expected, one V3 drop, no V4 drop.
        frame(220, 320, 10, 3, 1)
        frame(320, 520, 12, 4, 2)  # Straddles end; excluded.
        event('FrameSequenceTrackerV3', 'b', 0, {'name': 'Unrelated'}, '2')
        frame(120, 220, 100, 99, 99, '2')
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / 'trace.json'
            path.write_text(json.dumps({'traceEvents': events}))
            result = summary.summarize(str(path))
        self.assertEqual(set(result['trackers']), {'JSAnimation'})
        self.assertEqual(result['trackers']['JSAnimation'], {
            'expected': 4, 'droppedV3': 1, 'droppedV4': 0, 'intervals': 2,
            'producedV3': 3, 'dropPercentV3': 25.0, 'dropPercentV4': 0.0})


if __name__ == '__main__':
    unittest.main()
