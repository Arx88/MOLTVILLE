import time, json, requests, math
base='http://localhost:3001'
headers={'x-api-key':'moltville_478b4af28cc94a3f99e6d0e6ffbaede5'}
samples=[]
for _ in range(12):
    s=requests.get(base+'/api/world/state',timeout=5).json()
    c=requests.get(base+'/api/world/conversations',timeout=5).json()
    p=requests.get(base+'/api/coordination/proposals?limit=20',headers=headers,timeout=5).json().get('proposals',[])
    agents=s.get('agents',{})
    states=[(v or {}).get('state','unknown') for v in agents.values()]
    counts={}
    for st in states:
        counts[st]=counts.get(st,0)+1
    n=sum(counts.values()) or 1
    ent=-sum((v/n)*math.log((v/n),2) for v in counts.values() if v)
    samples.append({
        'tick':s.get('tick'),
        'conv_count':len(c) if isinstance(c,list) else 0,
        'active_props':sum(1 for x in p if x.get('status') in ('pending','in_progress')),
        'done_props':sum(1 for x in p if x.get('status')=='done'),
        'state_entropy':round(ent,3),
        'state_counts':counts,
    })
    time.sleep(5)
print(json.dumps(samples,ensure_ascii=False))
