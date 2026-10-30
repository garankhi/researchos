"""Real two-connection checks. Fixtures are retained: disposable DB ONLY."""
import argparse
import os
import subprocess
import time
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--psql', required=True)
parser.add_argument('--port', required=True)
parser.add_argument('--database', required=True)
parser.add_argument('--user', required=True)
parser.add_argument('--confirm-disposable', action='store_true', required=True)
args = parser.parse_args()
base = [args.psql, '-X', '-h', '127.0.0.1', '-p', args.port, '-U', args.user,
        '-d', args.database, '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-Atq']


def run(sql, state=None):
    result = subprocess.run(base + ['-c', sql], capture_output=True, text=True, timeout=20)
    if state:
        assert result.returncode != 0 and state in result.stderr, result.stderr
    else:
        assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def blocked_race(first_sql, second_sql, state=None):
    name = 'researchos-race-' + uuid.uuid4().hex
    env = dict(os.environ, PGAPPNAME=name)
    proc = subprocess.Popen(base + ['-c', f'BEGIN; {first_sql}; SELECT pg_sleep(3); COMMIT;'],
                            env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        deadline = time.monotonic() + 10
        while run(f"SELECT count(*) FROM pg_stat_activity WHERE application_name='{name}' AND wait_event='PgSleep'") != '1':
            if proc.poll() is not None or time.monotonic() > deadline:
                raise AssertionError('First transaction did not reach locked/sleeping stage: ' + proc.communicate()[1])
            time.sleep(0.05)
        result = run(second_sql, state)
        _, error = proc.communicate(timeout=10)
        assert proc.returncode == 0, error
        return result
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.communicate()


owner, applicant, third, opportunity, application = [str(uuid.uuid4()) for _ in range(5)]
for ident in (owner, applicant, third):
    run(f"INSERT INTO users(id,fptu_guid,user_type,email,full_name,department_unit) VALUES('{ident}','{ident}','FACULTY','{ident}@test.invalid','Concurrency fixture','FPTU')")
run(f"INSERT INTO research_opportunities(id,creator_id,title,opportunity_kind,description,application_deadline) VALUES('{opportunity}','{owner}','Concurrency fixture','PROJECT_FORMATION','Test',clock_timestamp()+interval '1 day'); UPDATE research_opportunities SET status='OPEN' WHERE id='{opportunity}'")
insert = f"INSERT INTO opportunity_applications(opportunity_id,applicant_id,applicant_note) VALUES('{opportunity}','{applicant}','Race')"
blocked_race(insert, insert, '23505')
assert run(f"SELECT count(*) FROM opportunity_applications WHERE opportunity_id='{opportunity}' AND status<>'WITHDRAWN'") == '1'
print('PASS concurrent duplicate submissions: exactly one non-withdrawn row')

application = run(f"SELECT id FROM opportunity_applications WHERE opportunity_id='{opportunity}'")
withdraw = f"UPDATE opportunity_applications SET status='WITHDRAWN' WHERE id='{application}' AND applicant_id='{applicant}' AND status='PENDING'"
respond = f"UPDATE opportunity_applications SET status='DECLINED',responded_by='{owner}' WHERE id='{application}' AND status='PENDING' RETURNING id"
assert blocked_race(withdraw, respond) == ''
assert run(f"SELECT status FROM opportunity_applications WHERE id='{application}'") == 'WITHDRAWN'
print('PASS withdrawal versus response: loser updates zero rows; history preserved')

blocked_race(f"UPDATE research_opportunities SET status='CLOSED' WHERE id='{opportunity}'",
             f"INSERT INTO opportunity_applications(opportunity_id,applicant_id,applicant_note) VALUES('{opportunity}','{third}','Too late')", '23514')
assert run(f"SELECT count(*) FROM opportunity_applications WHERE opportunity_id='{opportunity}'") == '1'
print('PASS closing versus new submission: blocked insert rechecks closed state')

# Handover writes must serialize on the resource and reject the stale holder.
admin_one, admin_two, work = [str(uuid.uuid4()) for _ in range(3)]
for ident in (admin_one, admin_two):
    run(f"INSERT INTO users(id,user_type,email,full_name,department_unit) VALUES('{ident}','STAFF','{ident}@test.invalid','Policy race admin','FPTU'); INSERT INTO user_role_assignments(user_id,role,grant_source) VALUES('{ident}','ADMIN','SYSTEM')")
run(f"INSERT INTO research_outputs(id,owner_id,created_by) VALUES('{work}','{owner}','{owner}')")


def handover(recipient):
    return f"INSERT INTO resource_handovers(output_id,previous_user_id,new_user_id,performed_by,basis,authorization_reference,reason) VALUES('{work}','{owner}','{recipient}','{admin_one}','HOLDER_CONSENT','Verified test consent','Race fixture')"


blocked_race(handover(applicant), handover(third), '23514')
assert run(f"SELECT owner_id FROM research_outputs WHERE id='{work}'") == applicant
assert run(f"SELECT count(*) FROM resource_handovers WHERE output_id='{work}'") == '1'
print('PASS concurrent handovers: exactly one holder change/log; stale request rejected')

# This explicitly exercises the management transaction contract, not a raw-SQL
# prohibition or an implemented HTTP endpoint. Every admin-affecting endpoint
# must acquire the same mutex before checking/removing a live admin.
blocked_race(f"SELECT assert_admin_removal_allowed('{admin_one}'); UPDATE users SET is_active=false WHERE id='{admin_one}'",
             f"SELECT assert_admin_removal_allowed('{admin_two}'); UPDATE users SET is_active=false WHERE id='{admin_two}'", '23514')
assert run(f"SELECT is_admin('{admin_one}'),is_admin('{admin_two}')") == 'f|t'
print('PASS concurrent admin deactivation with management guard: last active admin retained')

# Both orderings, for both authentication methods. The INSERT guard must also
# work if a caller read active=true earlier and did not explicitly lock users.
for method in ('LOCAL', 'OIDC'):
    account, identity, session_id = [str(uuid.uuid4()) for _ in range(3)]
    run(f"INSERT INTO users(id,user_type,email,full_name,department_unit) VALUES('{account}','FACULTY','{account}@test.invalid','Session race','FPTU')")
    identity_sql = 'NULL'
    if method == 'OIDC':
        run(f"INSERT INTO oidc_identities(id,user_id,issuer,subject) VALUES('{identity}','{account}','https://race.idp.invalid','{account}')")
        identity_sql = f"'{identity}'"
    token = uuid.uuid4().hex + uuid.uuid4().hex
    insert_session = f"INSERT INTO user_sessions(id,user_id,auth_method,identity_id,session_token_hash,authenticated_at,expires_at,idle_expires_at) VALUES('{session_id}','{account}','{method}',{identity_sql},'{token}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+interval '1 day',CURRENT_TIMESTAMP+interval '1 hour')"
    deactivate = f"UPDATE users SET is_active=false WHERE id='{account}'"
    blocked_race(deactivate, insert_session, '23514')
    assert run(f"SELECT count(*) FROM user_sessions WHERE id='{session_id}'") == '0'
    run(f"UPDATE users SET is_active=true WHERE id='{account}'")
    assert run(f"SELECT count(*) FROM active_user_sessions WHERE user_id='{account}'") == '0'
    blocked_race(insert_session, deactivate)
    assert run(f"SELECT revocation_reason FROM user_sessions WHERE id='{session_id}'") == 'ACCOUNT_DEACTIVATED'
    run(f"UPDATE users SET is_active=true WHERE id='{account}'")
    assert run(f"SELECT count(*) FROM active_user_sessions WHERE user_id='{account}'") == '0'
    print(f'PASS {method} login/deactivation in both orders: rejected or revoked; never revived')

# Backend contract: users -> credentials -> sessions, including reset flows.
# SQL does not verify passwords: synthetic hashes only test transaction ordering.
account = str(uuid.uuid4())
run(f"INSERT INTO users(id,user_type,email,full_name,department_unit) VALUES('{account}','FACULTY','{account}@test.invalid','Password race','FPTU'); INSERT INTO local_credentials(user_id,password_hash) VALUES('{account}','TEST_ONLY_OLD_HASH')")
lock_user = f"SELECT id FROM users WHERE id='{account}' FOR UPDATE"
lock_credentials = f"SELECT password_hash FROM local_credentials WHERE user_id='{account}' FOR UPDATE"
reset = f"{lock_user}; UPDATE local_credentials SET password_hash='TEST_ONLY_NEW_HASH' WHERE user_id='{account}'"
observed = blocked_race(reset, f"BEGIN ISOLATION LEVEL READ COMMITTED; {lock_user}; {lock_credentials}; COMMIT")
assert observed.splitlines()[-1] == 'TEST_ONLY_NEW_HASH', observed
session_id = str(uuid.uuid4())
token = uuid.uuid4().hex + uuid.uuid4().hex
login = f"{lock_user}; {lock_credentials}; INSERT INTO user_sessions(id,user_id,auth_method,session_token_hash,authenticated_at,expires_at,idle_expires_at) VALUES('{session_id}','{account}','LOCAL','{token}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+interval '1 day',CURRENT_TIMESTAMP+interval '1 hour')"
blocked_race(login, f"BEGIN ISOLATION LEVEL READ COMMITTED; {lock_user}; UPDATE local_credentials SET password_hash='TEST_ONLY_RESET_AGAIN' WHERE user_id='{account}'; COMMIT")
assert run(f"SELECT revocation_reason FROM user_sessions WHERE id='{session_id}'") == 'PASSWORD_CHANGED'
print('PASS login/reset lock order: login sees new hash or its session is revoked')
