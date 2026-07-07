#!/bin/bash
# Substitui operadores de atribuição lógica (Node 15+) por equivalentes Node 14:
#   x ??= y   ->  if (x == null) { x = y; }
#   x ||= y   ->  x = x || y;
#   x &&= y   ->  x = x && y;

TARGET_DIR="./node_modules"

echo "Buscando arquivos .js com ??=, ||= ou &&= em $TARGET_DIR ..."
FILES=$(grep -rl '\?\?=\|||=\|&&=' "$TARGET_DIR" --include="*.js" 2>/dev/null)

if [ -z "$FILES" ]; then
  echo "Nenhum arquivo encontrado."
  exit 0
fi

COUNT=0
for FILE in $FILES; do
  # Pula .map (source maps, desnecessário corrigir)
  if [[ "$FILE" == *.map ]]; then
    continue
  fi

  # ??= : x ??= expr;  ->  if (x == null) { x = expr; }
  perl -i -pe 's/(\b[\w.[\]'"'"'"]+)\s*\?\?=\s*([^;]+);/if ($1 == null) { $1 = $2; }/g' "$FILE"

  # ||= : x ||= expr;  ->  x = x || expr;
  perl -i -pe 's/(\b[\w.[\]'"'"'"]+)\s*\|\|=\s*([^;]+);/$1 = $1 || $2;/g' "$FILE"

  # &&= : x &&= expr;  ->  x = x && expr;
  perl -i -pe 's/(\b[\w.[\]'"'"'"]+)\s*&&=\s*([^;]+);/$1 = $1 && $2;/g' "$FILE"

  echo "  Corrigido: $FILE"
  COUNT=$((COUNT + 1))
done

echo ""
echo "Total: $COUNT arquivo(s) corrigido(s)."
