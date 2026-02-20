#!/usr/bin/env python3
"""Geoff Reddit Bot — daily comment replies to the master comment."""

import argparse
import json
import os
import sys
from datetime import datetime, timezone

import praw
from dotenv import load_dotenv
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter
import vertexai
from vertexai.generative_models import GenerativeModel

from topics import TOPICS

load_dotenv()

PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "geotab-geoff")
COLLECTION = "reddit_posts"
BOT_FOOTER = (
    "\n\n---\n*I'm Geoff, an AI fleet safety coach built for the "
    "[Geotab Vibe Coding Competition](https://www.geotab.com/vibe-coding-competition/). "
    "| [GitHub](https://github.com/robertlagrasse/geotab-geoff) "
    "| [Guides](https://github.com/robertlagrasse/geotab-geoff/tree/main/guides)*"
)


def get_firestore_client():
    return firestore.Client(project=PROJECT_ID)


def get_used_topics(db):
    """Return set of topic_tags already posted."""
    docs = db.collection(COLLECTION).stream()
    return {doc.to_dict().get("topic_tag") for doc in docs}


def already_posted_today(db):
    """Check if we already posted today (UTC)."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    query = (
        db.collection(COLLECTION)
        .where(filter=FieldFilter("date", "==", today))
        .limit(1)
    )
    return len(list(query.stream())) > 0


def pick_topic(used_topics):
    """Pick the next topic from the ordered list that hasn't been used."""
    for i, entry in enumerate(TOPICS):
        tag = entry["topic"].lower().replace(" ", "-")[:40]
        if tag not in used_topics:
            return i, entry, tag
    return None, None, None


def load_guide_content(guide_path):
    """Load guide markdown for context injection."""
    if not guide_path:
        return None
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    full_path = os.path.join(repo_root, guide_path)
    if os.path.exists(full_path):
        with open(full_path, "r") as f:
            content = f.read()
        # Truncate to ~4000 chars to stay within reasonable prompt size
        if len(content) > 4000:
            content = content[:4000] + "\n...(truncated)"
        return content
    return None


def generate_content(topic_entry, used_topics, guide_content):
    """Call Gemini 2.0 Flash to generate the comment body."""
    vertexai.init(project=PROJECT_ID, location="us-central1")
    model = GenerativeModel("gemini-2.0-flash-001")

    context_block = ""
    if guide_content:
        context_block = f"\n\nReference material (use for specific details):\n```\n{guide_content}\n```"

    prompt = f"""You are Geoff, an AI fleet safety coach. You're writing a daily Reddit comment
sharing what you learned during the Geotab Vibe Coding Competition.

Today's topic: {topic_entry['topic']}
{context_block}

Previously posted topics (don't repeat these): {', '.join(used_topics) if used_topics else 'None yet — this is the first post!'}

Write a 2-3 paragraph Reddit comment. Be conversational, practical, and helpful.
Include specific technical details that would help other developers.
Do NOT include a title or heading — this is a comment reply, not a post.
Do NOT use hashtags or emoji.
Keep it under 300 words.

Return valid JSON only: {{"body": "the comment text in Reddit Markdown", "topic_tag": "unique_short_tag"}}"""

    response = model.generate_content(prompt)
    text = response.text.strip()

    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
    if text.endswith("```"):
        text = text[:-3]
    if text.startswith("json"):
        text = text[4:]

    return json.loads(text.strip())


def post_to_reddit(body, dry_run=False):
    """Post a reply to the master comment via PRAW."""
    comment_id = os.environ.get("REDDIT_COMMENT_ID")
    if not comment_id:
        print("ERROR: REDDIT_COMMENT_ID not set")
        sys.exit(1)

    if dry_run:
        print(f"\n{'='*60}")
        print("DRY RUN — would reply to comment: " + comment_id)
        print(f"{'='*60}")
        print(body)
        print(f"{'='*60}\n")
        return None

    reddit = praw.Reddit(
        client_id=os.environ["REDDIT_CLIENT_ID"],
        client_secret=os.environ["REDDIT_CLIENT_SECRET"],
        username=os.environ["REDDIT_USERNAME"],
        password=os.environ["REDDIT_PASSWORD"],
        user_agent="GeoffTheCoach/1.0 (by /u/" + os.environ["REDDIT_USERNAME"] + ")",
    )

    comment = reddit.comment(comment_id)
    reply = comment.reply(body)
    print(f"Posted: https://reddit.com{reply.permalink}")
    return reply


def log_to_firestore(db, topic_tag, topic, reddit_url):
    """Log the post to Firestore for dedup tracking."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    db.collection(COLLECTION).add({
        "topic_tag": topic_tag,
        "topic": topic,
        "reddit_url": reddit_url or "dry-run",
        "date": today,
        "posted_at": firestore.SERVER_TIMESTAMP,
    })


def main():
    parser = argparse.ArgumentParser(description="Geoff Reddit Bot")
    parser.add_argument("--dry-run", action="store_true", help="Generate content without posting")
    args = parser.parse_args()

    db = get_firestore_client()

    # Safety: one post per day
    if not args.dry_run and already_posted_today(db):
        print("Already posted today. Exiting.")
        return

    used_topics = get_used_topics(db)
    day_num, topic_entry, topic_tag = pick_topic(used_topics)

    if topic_entry is None:
        print("All topics exhausted. Nothing to post.")
        return

    print(f"Day {day_num + 1}/{len(TOPICS)}: {topic_entry['topic']}")

    guide_content = load_guide_content(topic_entry.get("guide"))
    result = generate_content(topic_entry, used_topics, guide_content)

    body = result["body"] + BOT_FOOTER
    topic_tag = result.get("topic_tag", topic_tag)

    reply = post_to_reddit(body, dry_run=args.dry_run)

    if not args.dry_run:
        reddit_url = f"https://reddit.com{reply.permalink}" if reply else None
        log_to_firestore(db, topic_tag, topic_entry["topic"], reddit_url)
        print("Logged to Firestore.")
    else:
        print("Dry run — skipped Firestore logging.")


if __name__ == "__main__":
    main()
