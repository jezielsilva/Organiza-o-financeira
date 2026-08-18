/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo: projection (Projeção Financeira & Motor de Cálculo)
 * Camada: domain (Regras de negócio puras em TypeScript)
 */

import { FixedBill, IncomeSource } from "../../../types";
import { addMonths } from "../../../core/shared/formatters";

export interface ProjecaoInput {
  mesInicial: string;
  rendas: IncomeSource[];
  contasFixas: FixedBill[];
}

export interface MesProjetado {
  mes: string;
  totalRendas: number;
  totalContasFixas: number;
  faturaCartao: number;
  saldoMensal: number;
  saldoAcumulado: number;
}

export interface ResultadoProjecao {
  mesInicial: string;
  rendaMensalBase: number;
  custoFixoMensal: number;
  saldoBasesMensal: number;
  meses: MesProjetado[];
}

export function calcularProjecao(input: ProjecaoInput): ResultadoProjecao {
  const { mesInicial, rendas, contasFixas } = input;

  const rendasRecorrentes = rendas.filter((r) => !r.recurrence || r.recurrence === "monthly");
  const rendasDoMesInicial = rendas.filter((r) => r.month === mesInicial);
  const rendasValidas = rendasRecorrentes.length > 0 ? rendasRecorrentes : rendasDoMesInicial;

  const rendaMensalBase: number = Number(
    rendasValidas
      .reduce((acc, renda) => acc + Number(renda.value), 0)
      .toFixed(2)
  );

  const contasAtivas = contasFixas.filter((c) => c.active);
  const custoFixoMensal: number = Number(
    contasAtivas
      .reduce((acc, conta) => acc + Number(conta.value), 0)
      .toFixed(2)
  );

  const saldoBasesMensal: number = Number(
    (rendaMensalBase - custoFixoMensal).toFixed(2)
  );

  let saldoAcumuladoAnterior: number = 0;

  const meses: MesProjetado[] = Array.from({ length: 12 }, (_, i) => {
    const mes = addMonths(mesInicial, i);

    const totalRendas = Number(
      rendas
        .filter((r) => {
          if (r.recurrence === "single") {
            return r.month === mes;
          }
          return !r.month || r.month <= mes;
        })
        .reduce((acc, r) => acc + Number(r.value), 0)
        .toFixed(2)
    );

    const faturaCartao: number = 0;
    const saldoMensal: number = Number(
      (totalRendas - custoFixoMensal - faturaCartao).toFixed(2)
    );
    const saldoAcumulado: number = Number(
      (saldoAcumuladoAnterior + saldoMensal).toFixed(2)
    );

    saldoAcumuladoAnterior = saldoAcumulado;

    return {
      mes,
      totalRendas,
      totalContasFixas: custoFixoMensal,
      faturaCartao,
      saldoMensal,
      saldoAcumulado,
    };
  });

  return {
    mesInicial,
    rendaMensalBase,
    custoFixoMensal,
    saldoBasesMensal,
    meses,
  };
}

export function normalizarDiaVencimento(anoMes: string, diaDesejado: number): number {
  const [ano, mes] = anoMes.split("-").map(Number);
  const ultimoDiaDoMes = new Date(ano, mes, 0).getDate();
  return Math.min(diaDesejado, ultimoDiaDoMes);
}

export function rotacionarJanelaTemporal(
  mesesSalvos: MesProjetado[],
  mesAtual: string,
  rendaMensal: number,
  custoFixo: number
): MesProjetado[] {
  if (mesesSalvos.length === 0) {
    return [];
  }

  const mesesOrdenados = [...mesesSalvos].sort((a, b) => a.mes.localeCompare(b.mes));
  const primeiroMesSalvo = mesesOrdenados[0].mes;

  if (mesAtual <= primeiroMesSalvo) {
    return mesesOrdenados;
  }

  const mesesFuturosRestantes = mesesOrdenados.filter((m) => m.mes >= mesAtual);
  const mesesEmFalta = 12 - mesesFuturosRestantes.length;

  if (mesesEmFalta <= 0) {
    return mesesFuturosRestantes.slice(0, 12);
  }

  let saldoAcumuladoAnterior = 0;
  let ultimoMesDisponivel = mesAtual;

  if (mesesFuturosRestantes.length > 0) {
    const ultimo = mesesFuturosRestantes[mesesFuturosRestantes.length - 1];
    saldoAcumuladoAnterior = ultimo.saldoAcumulado;
    ultimoMesDisponivel = ultimo.mes;
  } else {
    const ultimoPassado = mesesOrdenados[mesesOrdenados.length - 1];
    saldoAcumuladoAnterior = ultimoPassado.saldoAcumulado;
    ultimoMesDisponivel = addMonths(ultimoPassado.mes, 1);
  }

  const novosMeses: MesProjetado[] = Array.from({ length: mesesEmFalta }, (_, i) => {
    const proximoMes = addMonths(ultimoMesDisponivel, mesesFuturosRestantes.length > 0 ? i + 1 : i);
    const totalRendas = Number(rendaMensal);
    const faturaCartao = 0;
    const saldoMensal = Number((totalRendas - custoFixo - faturaCartao).toFixed(2));
    const saldoAcumulado = Number((saldoAcumuladoAnterior + saldoMensal).toFixed(2));
    saldoAcumuladoAnterior = saldoAcumulado;

    return {
      mes: proximoMes,
      totalRendas,
      totalContasFixas: custoFixo,
      faturaCartao,
      saldoMensal,
      saldoAcumulado,
    };
  });

  return [...mesesFuturosRestantes, ...novosMeses];
}

export function atualizarFaturaCartao(
  resultado: ResultadoProjecao,
  mes: string,
  novaFatura: number
): ResultadoProjecao {
  const faturaValidada: number = Number(Math.max(0, novaFatura).toFixed(2));
  let acumulado: number = 0;

  const mesesAtualizados: MesProjetado[] = resultado.meses.map((m) => {
    const fatura = m.mes === mes ? faturaValidada : m.faturaCartao;
    const saldoMensal = Number((m.totalRendas - m.totalContasFixas - fatura).toFixed(2));
    acumulado = Number((acumulado + saldoMensal).toFixed(2));

    return {
      ...m,
      faturaCartao: fatura,
      saldoMensal,
      saldoAcumulado: acumulado,
    };
  });

  return { ...resultado, meses: mesesAtualizados };
}
