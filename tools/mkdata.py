import csv, json, sys
src, out = sys.argv[1], sys.argv[2]
def load(path):
    lines = open(path, encoding='utf-8').read().splitlines()
    heads = [i for i, l in enumerate(lines) if l.startswith('"in_deco"')] + [len(lines)]
    dives = []
    for a, b in zip(heads, heads[1:]):
        rows = list(csv.reader(lines[a:b]))
        h = rows[0]; rows = [r for r in rows[1:] if len(r) == len(h)]
        col = lambda n: [r[h.index(n)] for r in rows]
        ncyl = sum(1 for x in h if x.endswith('_cylinder'))
        d = {
            'sec': [int(x) for x in col('sec')],
            'depth': [round(int(x) / 1000, 2) for x in col('depth')],
            'temp': [round(int(x) / 1000 - 273.15, 1) if int(x) else None for x in col('temperature')],
            'sac': [round(int(x) / 1000, 2) for x in col('sac')],
            'po2': [round(float(x), 3) for x in col('pressureo2')],
            'pn2': [round(float(x), 3) for x in col('pressuren2')],
            'phe': [round(float(x), 3) for x in col('pressurehe')],
            'amb': [round(float(x), 3) for x in col('ambpressure')],
            'hr': [int(x) for x in col('heartbeat')],
            'ceiling': [round(int(x) / 1000, 2) for x in col('ceiling')],
            'tissues': [[int(x) for x in col('percentage_%d' % i)] for i in range(16)],
            'pressures': [],
        }
        for c in range(ncyl):
            s, i = col('pressure_%d_cylinder' % c), col('pressure_%d_interpolated' % c)
            d['pressures'].append([round((int(a) or int(b)) / 1000, 1) or None for a, b in zip(s, i)])
        dives.append(d)
    return dives
hr = load(src + '/test36-hr.csv')[0]
dives = {n: load(src + '/dive%d.csv' % n)[0] for n in (42, 218, 232, 233, 234, 235)}
models = {42: 'Suunto D5'}
d233 = dives[233]
# Borrow test36's heart rate, stretched over dive 233's duration.
T = d233['sec'][-1]; T36 = hr['sec'][-1]
def hr_at(t):
    t36 = t / T * T36
    for k in range(1, len(hr['sec'])):
        if hr['sec'][k] >= t36:
            return hr['hr'][k]
    return hr['hr'][-1]
d233hr = dict(d233); d233hr['hr'] = [hr_at(t) for t in d233['sec']]
data = {}
for n in sorted(dives):
    data['d%d' % n] = {'name': 'Dive %d' % n, 'model': models.get(n, 'Shearwater Perdix 2'), 'dive': dives[n]}
data['d233hr'] = {'name': 'Dive 233 + heart rate borrowed from test36.xml (synthetic, for layout only)', 'model': 'Shearwater Perdix 2', 'dive': d233hr}
data['test36'] = {'name': 'test36.xml (Subsurface test data, heart rate, no tank pressure)', 'model': 'Uwatec Galileo Sol', 'dive': hr}
header = '// Generated from Subsurface profile data exports (save_profiledata).\n'
open(out, 'w', encoding='utf-8', newline='\n').write(header + 'const DIVES = ' + json.dumps(data, separators=(',', ':')) + ';\n')
print({k: (len(v['dive']['sec']), v['dive']['sec'][-1], len(v['dive']['pressures'])) for k, v in data.items()})
