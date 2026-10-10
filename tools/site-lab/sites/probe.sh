#!/bin/sh
# prints: category|url|http_code|bytes|final_url
cat=$(echo "$1" | cut -d'|' -f1); u=$(echo "$1" | cut -d'|' -f2)
r=$(curl -s -L -o /dev/null -m 25 -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" -w "%{http_code}|%{size_download}|%{url_effective}" "$u" 2>/dev/null)
echo "$cat|$u|${r:-000|0|}"
