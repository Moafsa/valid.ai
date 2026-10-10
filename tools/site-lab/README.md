# Laboratório de sites do be-vallid

Simula vários tipos de site (quiz, VSL, landing, espera, funil gigante, site hostil), clona pelo scanner de verdade
e compara original x clone (telas, títulos, diferença de pixel, peso, tempo).

    python3 gen_lab.py                 # gera os sites em www/ + expected.json
    python3 lab_server.py 8099 &       # serve os sites (o scanner acessa por http://172.18.0.1:8099)
    python3 lab_e2e.py <site>          # clona + compara um quiz/funil  (resultado em results_<site>.txt)
    python3 lab_e2e_tl.py <site>       # clona + compara ao longo do tempo/scroll (tl_<site>.txt)
    python3 lab_fail.py block=/x/block # sites hostis: tem que terminar com mensagem clara
    python3 lab_summary.py             # tabela geral

Os clones criados ganham o nome "TEST lab_*"; apague depois. `harness/run.sh <url> <label>` cria o projeto e dispara o scan.
Notas completas na memória do Claude: reference_lab_sites.md.
