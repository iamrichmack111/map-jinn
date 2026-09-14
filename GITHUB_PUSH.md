# GitHub push commands

## New repository

```bash
cd ~/Downloads/map-jinn-17.4-github-ready

git init -b main
git add .
git commit -m "release: Map Jinn 17.4 clean streets and apparel labels"

gh repo create map-jinn --public --source=. --remote=origin --push
./scripts/publish-topics.sh
```

## Existing repository

```bash
cd ~/Downloads/map-jinn-17.4-github-ready

git init -b main 2>/dev/null || true
git add .
git commit -m "release: Map Jinn 17.4 clean streets and apparel labels"

git remote remove origin 2>/dev/null || true
git remote add origin git@github.com:YOUR_GITHUB_USERNAME/map-jinn.git
git push -u origin main
./scripts/publish-topics.sh
```

## Wiki

Enable the repository Wiki in GitHub Settings, create its first page once, then:

```bash
./scripts/push-wiki.sh
```

## Release tag

```bash
git tag -a v17.4.0 -m "Map Jinn 17.4"
git push origin v17.4.0
```

## One-command publisher

After `gh auth login`, the included publisher can create or update the repository, push `main`, apply topics, and enable Issues/Wiki:

```bash
./scripts/push-github.sh map-jinn public
```
