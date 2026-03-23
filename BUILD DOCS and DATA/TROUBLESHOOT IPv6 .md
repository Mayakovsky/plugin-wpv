My attempts at IPv6 connection on port 5432 are getting refused. I believe I have the proper URI and I just reset the password.

What am I missing?




Reasoned
I'll check the Supabase docs for guidance on IPv6 connectivity to Postgres (port 5432), supported regions, and any required configuration or limitations.


Ran search_docs

Reasoned
Likely cause
Supabase direct Postgres endpoints (db.<project-ref>.supabase.co:5432) are IPv6-only by default. A connection refused on port 5432 over IPv6 typically means either:

Your network/host doesn’t support outbound IPv6, or
You’re using the direct hostname but your client is trying IPv4 first and not falling back correctly.
Resetting the DB password won’t affect reachability—only authentication after a TCP connection is established.

Quick checks
Verify IPv6 support from the machine making the connection:
curl -6 https://ifconfig.co/ip
nslookup db..supabase.co → confirm it returns an AAAA record (IPv6).
Try psql explicitly over IPv6:
psql 'postgresql://postgres:@db..supabase.co:5432/postgres?sslmode=require'
If your platform doesn’t support IPv6 (common on some CI/CD and hosting providers), direct connections will be refused.

Working solutions
Pick one of these, depending on your environment:

Use Supavisor (IPv4-compatible)
Session mode (port 5432) – good for persistent apps and supports prepared statements:
postgresql://postgres.:[YOUR-PASSWORD]@aws-0-.pooler.supabase.com:5432/postgres
Transaction mode (port 6543) – best for serverless/short-lived connections:
postgresql://postgres.:[YOUR-PASSWORD]@aws-0-.pooler.supabase.com:6543/postgres Find both under Connect in your project dashboard.
Enable the Dedicated IPv4 Add-on (Pro+)
Provision a static IPv4 for the direct connection hostname. Enable in Add-ons. Note: DNS may take up to a minute to switch.
Use Supabase client libraries or Data APIs
Libraries and REST/GraphQL routes are IPv4-compatible and avoid direct DB networking issues.
Common pitfalls
Using the direct connection string on a platform that only supports IPv4.
Forgetting sslmode=require in some clients, causing TLS failures that appear as connection issues.
Mixing credentials: the “session/transaction” pooler URIs include a user with a dot in the name (e.g., postgres.); use that exact user from the Connect panel.
If you want, I can:
Validate your current connection string format (redact the password).
Suggest the exact session/transaction URI for your region.
Help choose between session vs. transaction mode based on your runtime.
Mayakovsky
psql "postgresql://postgres:@db.ymuyfxztfpdldqtbkoic.supabase.co:5432/postgres?sslmode=require"

Result: connection to server at "db.ymuyfxztfpdldqtbkoic.supabase.co" (2600:1f13:838:6e29:ebcd:bf28:17da:a198), port 5432 failed: Connection refused

VPS: AWS Lightsail us-west-2, Ubuntu 24.04
IPv6 outbound confirmed working (curl -6 https://ipv6.google.com succeeds)
AAAA record resolves correctly
psql 16.13



Reasoned
Thanks for the details — this narrows it down
Given:

You’re on AWS Lightsail us-west-2 with IPv6 egress working
AAAA resolves and psql is v16 with sslmode=require
The error is TCP “connection refused” to the IPv6 address on port 5432
This points to the direct Postgres endpoint (IPv6) not accepting connections from your host at that moment, while DNS and network IPv6 are fine. Two common causes:

Regional routing or transient block at the direct IPv6 endpoint
Your project’s direct port 5432 is reachable only over IPv6, but your environment experiences intermittent IPv6 reachability to that specific network (can happen with AWS IPv6 + certain upstreams)
Regardless, Supabase officially recommends using the pooler when IPv4 is preferred or when direct IPv6 has issues.

Immediate workaround (recommended)
Use Supavisor (IPv4-compatible):

Session mode (supports prepared statements; good for a persistent VPS): postgresql://postgres.:[YOUR-PASSWORD]@aws-0-.pooler.supabase.com:5432/postgres

Transaction mode (best for short-lived/serverless; no prepared statements): postgresql://postgres.:[YOUR-PASSWORD]@aws-0-.pooler.supabase.com:6543/postgres

For your project:

Replace with ymuyfxztfpdldqtbkoic
Replace with your project’s region slug (shown in the Connect panel). Example formats:
aws-0-us-west-2.pooler.supabase.com
aws-0-us-east-1.pooler.supabase.com Use the exact URIs from your project’s Connect page to avoid typos (the username includes a dot).
Example (adjust region and use your password): psql "postgresql://postgres.ymuyfxztfpdldqtbkoic:@aws-0-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require"

If you prefer transaction mode: psql "postgresql://postgres.ymuyfxztfpdldqtbkoic:@aws-0-us-west-2.pooler.supabase.com:6543/postgres?sslmode=require"

Alternative
If you must use direct connections on port 5432 and want IPv4:

Enable the Dedicated IPv4 Add-on in your project add-ons. After enabling, the direct hostname will resolve to an IPv4 address. DNS change can take up to a minute.
Extra diagnostics (optional)
If you want to continue troubleshooting direct IPv6:

Test TCP reachability from your VPS:
nc -6 -vz db.ymuyfxztfpdldqtbkoic.supabase.co 5432
Try connecting from a different IPv6-capable network (desktop on native IPv6) to isolate AWS path issues.
Share your project’s region; I’ll provide the exact pooler URIs to copy-paste.
Once you switch to the pooler URI above, you should be able to connect immediately.

Mayakovsky
Why would an endpoint not accept connections from my host? My hosting company is blocking the IPv6 connection?




Reasoned
What “connection refused” usually means here
Supabase’s direct Postgres endpoint (db.<project-ref>.supabase.co:5432) is IPv6-only by default.
A “connection refused” at the TCP level means the target host actively rejected the TCP SYN on that address/port. That typically isn’t caused by your client-side firewall if you can reach other IPv6 hosts (like ipv6.google.com).
It doesn’t imply your hosting provider is “blocking” IPv6 in general. More likely:
A routing quirk between your VPS’s IPv6 path and the Supabase network for that specific IPv6 prefix.
A transient issue on the direct IPv6 listener for your project/region.
Less commonly, a stateful network device along the path (NAT64/NPTv6/security group) interfering specifically with outbound port 5432 towards that prefix.
Given you can curl IPv6 to other destinations and DNS resolves an AAAA correctly, the symptom points to a path- or destination-specific failure, not a blanket IPv6 block by your host.

Why this happens in practice
Different providers/regions use different upstreams/peering. It’s possible your Lightsail us-west-2 route to the specific Supabase IPv6 subnet is impaired while other IPv6 routes work.
Some environments implement egress controls by destination/port, but Lightsail generally doesn’t block outbound 5432. If you added custom outbound rules or host-based firewalls, ensure TCP/5432 is allowed outbound.
Supabase’s shared direct endpoint can experience brief maintenance windows; during those windows, you may see “refused” until services restart. Using the pooler avoids this class of issue.
What you can do now
Use the IPv4-compatible pooler connection (recommended):

Session mode (good for persistent apps, supports prepared statements): psql "postgresql://postgres.ymuyfxztfpdldqtbkoic:***@aws-0-.pooler.supabase.com:5432/postgres?sslmode=require"
Transaction mode (best for short-lived/serverless): psql "postgresql://postgres.ymuyfxztfpdldqtbkoic:***@aws-0-.pooler.supabase.com:6543/postgres?sslmode=require" Copy the exact URIs from Connect in your dashboard to avoid typos.
If you must use direct 5432 and want IPv4:

Enable the Dedicated IPv4 Add-on. After DNS propagates, your direct hostname will resolve to IPv4 and avoid IPv6 path issues.
If you want to keep debugging direct IPv6
From the VPS, run:

nc -6 -vz db.ymuyfxztfpdldqtbkoic.supabase.co 5432
mtr -6 -T -P 5432 db.ymuyfxztfpdldqtbkoic.supabase.co (or traceroute -6 -T -p 5432 ...) These help reveal if the refusal is immediate at the destination or if there’s a path problem.
Try from another IPv6-capable network (home ISP with native IPv6) to confirm if it’s path-specific to Lightsail us-west-2.

Confirm no outbound egress rules on your instance or VPC block TCP/5432.

In short: your hosting provider likely isn’t blocking all IPv6—this is almost certainly a destination/path-specific issue. Using the IPv4 pooler (session or transaction) is the fastest, supported workaround and is generally recommended for production unless you specifically need direct connections.

Mayakovsky
Bash(ssh -i "C:/Users/kidco/.ssh/WhitepaperGrey.pem" ubuntu@44.243.254.19 'echo "=== nc ===" &&
nc -6 -vz db.ymuyfxztfpdldqtbkoic.supabase.co 5432 2>&1; echo "=== tr…) ⎿ === nc === nc: connect to db.ymuyfxztfpdldqtbkoic.supabase.co (2600:1f13:838:6e29:ebcd:bf28:17da:a19
8) port 5432 (tcp) failed: Connection refused … +6 lines (ctrl+o to expand) ⎿ (timeout 1m)

● This is definitive.

nc: Connection refused — the TCP RST came back immediately
mtr: Only 2 hops — the VPS (hop 1) goes directly to Supabase's IPv6 address (hop 2, 2600:1f13:838:6e29:ebcd:b...) with 0% packet loss and sub-millisecond latency
The packet reaches Supabase's server. There's no intermediate firewall dropping it. Supabase's
server itself is sending back a TCP RST on port 5432. The server is there, it's reachable, it
just isn't listening on that port over IPv6.

Conclusion: Supabase publishes an AAAA record for the direct database hostname but their PostgreSQL process isn't bound to the IPv6 interface on port 5432. This is a Supabase infrastructure bug — worth reporting to them with this mtr output as proof.




Reasoned
Thanks for running nc and mtr — here’s how to interpret that
nc “Connection refused” with an immediate RST from the target means your packets are reaching the host and the host isn’t accepting connections on that address:port at that moment.
That does not automatically mean “Postgres isn’t bound to IPv6.” With Supabase, there are two distinct endpoints on port 5432:
Direct Postgres: db..supabase.co (IPv6 by default)
Supavisor session pooler: aws-0-.pooler.supabase.com (IPv4)
The direct IPv6 listener can temporarily refuse connections during brief maintenance/restarts or while your project is resuming. It can also happen if the project is paused, or in rare network edge cases between your provider and our IPv6 subnet.
We do intentionally publish AAAA for db..supabase.co. Direct connections are IPv6-first by design, and the service normally listens on 5432 over IPv6.
Given your test shows a clean, immediate RST from the destination, the path is fine and the host is reachable. The refusal is on the destination side at that instant.

Actionable next steps
Use the IPv4-compatible pooler now (recommended)
Session mode (supports prepared statements; ideal for a persistent VPS): psql "postgresql://postgres.ymuyfxztfpdldqtbkoic:***@aws-0-.pooler.supabase.com:5432/postgres?sslmode=require"
Transaction mode (best for short-lived/serverless): psql "postgresql://postgres.ymuyfxztfpdldqtbkoic:***@aws-0-.pooler.supabase.com:6543/postgres?sslmode=require" Copy the exact URIs from your project’s Connect page to ensure the correct region and username.
If you must use direct 5432 and prefer IPv4
Enable the Dedicated IPv4 Add-on in Add-ons. After DNS flips, your direct hostname will resolve to IPv4.
If you want to keep debugging direct IPv6
Try again after a few minutes to rule out a transient restart.
Confirm the project isn’t paused and shows healthy in the Dashboard.
Share your project region; I can provide the precise pooler URI string.
Provide the exact mtr/traceroute output and the timestamp if you open a support ticket.
Bottom line
Your VPS/host isn’t blocking IPv6; your tests show the target responds.
This is most likely a transient refusal on the direct IPv6 endpoint rather than a persistent misconfiguration.
The supported, production-friendly workaround is to use the pooler (IPv4) connection string, which avoids IPv6 path issues and direct endpoint restarts.