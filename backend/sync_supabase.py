"""CLI utility for Supabase connectivity verification and SQLite data synchronization.

Usage:
    python -m backend.sync_supabase --test
    python -m backend.sync_supabase --push
"""
import sys
import argparse
from backend import supabase_client


def main():
    parser = argparse.ArgumentParser(description="Supabase connection and sync utility for Edutainal Portal")
    parser.add_argument("--test", action="store_true", help="Test connection to Supabase")
    parser.add_argument("--push", action="store_true", help="Push all SQLite records into Supabase")
    args = parser.parse_args()

    print("=" * 60)
    print("Edutainal Maverick World - Supabase Bridge")
    print("=" * 60)

    if not supabase_client.is_configured():
        print("[!] Supabase is not configured yet in .env or environment.")
        print("    Please provide:")
        print("      SUPABASE_URL=https://<your-project-id>.supabase.co")
        print("      SUPABASE_KEY=<your-service-role-key-or-anon-key>")
        print()
        print("    You can run `supabase/schema.sql` in your Supabase SQL Editor,")
        print("    and add your credentials to `.env`.")
        sys.exit(1)

    print(f"Connecting to: {supabase_client.SUPABASE_URL}")
    test_result = supabase_client.test_connection()

    if test_result.get("status") != "connected":
        print(f"[x] Connection failed: {test_result.get('error') or test_result.get('message')}")
        sys.exit(1)

    print("[✓] Successfully connected to Supabase project!")

    if args.push or not args.test:
        print("\nMigrating SQLite data into Supabase...")
        try:
            stats = supabase_client.push_sqlite_to_supabase()
            print("[✓] Synchronization complete:")
            print(f"    - Students:        {stats['students']}")
            print(f"    - Observations:    {stats['observations']}")
            print(f"    - Users:           {stats['users']}")
            print(f"    - Parent-Children: {stats['parent_children']}")
        except Exception as e:
            print(f"[x] Error during synchronization: {e}")
            sys.exit(1)


if __name__ == "__main__":
    main()
