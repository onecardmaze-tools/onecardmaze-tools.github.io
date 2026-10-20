"""Summarize Chromium FrameSequenceTrackerV3 presentation feedback.

Usage: python3 tests/summarize-render-trace.py trace-*.json.gz
Only named JSAnimation/RAF tracker spans are counted, never unrelated browser
surfaces. Cumulative expected/dropped counters are differenced per tracker.
OCM performance marks delimit the measured interval (excluding setup/warmup).
Source: chromium/src/cc/metrics/frame_sequence_metrics.cc, TraceData::Advance.
"""
import collections
import gzip
import json
import sys


def summarize(filename):
    opener = gzip.open if filename.endswith('.gz') else open
    with opener(filename, 'rt') as stream:
        events = json.load(stream)['traceEvents']
    marks = {event['name']: event['ts'] for event in events
             if event['name'] in ('OCM-measured-start', 'OCM-measured-end')}
    if len(marks) != 2:
        raise ValueError('Trace has no complete OCM measurement marks: ' + filename)
    start, end = marks['OCM-measured-start'], marks['OCM-measured-end']
    trackers, pending, counters = {}, {}, {}
    totals = collections.defaultdict(lambda: {'expected': 0, 'droppedV3': 0, 'droppedV4': 0, 'intervals': 0})
    details = []
    for event in sorted(events, key=lambda e: e['ts']):
        key = (event['pid'], str(event.get('id2', event.get('id', ''))))
        name, phase = event['name'], event['ph']
        if name == 'FrameSequenceTrackerV3':
            if phase == 'b':
                trackers[key] = event.get('args', {}).get('name')
                counters[key] = (0, 0, 0)
            elif phase == 'e':
                trackers.pop(key, None)
        elif name.strip() == 'Frame' and trackers.get(key) in ('JSAnimation', 'RAF'):
            if phase == 'b':
                values = event.get('args', {}).get('data', {}).get('values')
                if values:
                    current = (values['expected'], values['dropped_v3'], values['dropped_v4'])
                    previous = counters.get(key, (0, 0, 0))
                    pending[key] = (event['ts'], current[0]-previous[0], current[1]-previous[1], current[2]-previous[2], trackers[key])
                    counters[key] = current
            elif phase == 'e' and key in pending:
                begin, expected, dropped3, dropped4, kind = pending.pop(key)
                # Require both ends inside the measurement window. This avoids
                # attributing shader warmup or page setup to steady rendering.
                if begin >= start and event['ts'] <= end:
                    assert expected >= 0 and dropped3 >= 0 and dropped4 >= 0
                    total = totals[kind]
                    total['expected'] += expected
                    total['droppedV3'] += dropped3
                    total['droppedV4'] += dropped4
                    total['intervals'] += 1
                    if dropped3 or dropped4:
                        details.append({'kind': kind, 'atMs': (begin-start)/1000,
                                        'durationMs': (event['ts']-begin)/1000,
                                        'expected': expected, 'droppedV3': dropped3, 'droppedV4': dropped4})
    for total in totals.values():
        total['producedV3'] = total['expected']-total['droppedV3']
        total['dropPercentV3'] = 100*total['droppedV3']/max(1,total['expected'])
        total['dropPercentV4'] = 100*total['droppedV4']/max(1,total['expected'])
    return {'trace': filename, 'measuredMs': (end-start)/1000,
            'method': 'Chromium presentation-feedback counters, complete tracker intervals inside OCM measurement marks; JSAnimation and RAF overlap and must not be added together.',
            'trackers': dict(totals), 'droppedIntervals': details}


if __name__ == '__main__':
    print(json.dumps([summarize(filename) for filename in sys.argv[1:]], indent=2))
