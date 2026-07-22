#!/bin/sh
# Faux "helper Touch ID" pour test/touchid.js : simule les codes de sortie
# du vrai scripts/touchid.swift sans jamais toucher à la biométrie.
# $1 pilote le comportement (fait office de "reason" détourné pour le test).
case "$1" in
  ok) exit 0 ;;
  refuse) exit 1 ;;
  unavailable) exit 2 ;;
  weird) exit 3 ;;
  hang) sleep 5; exit 0 ;;
  *) exit 9 ;;
esac
