import os
import re
import json
import sys
from typing import List, Dict, Any
import pdfplumber

def extract_pdf_text(pdf_path: str) -> str:
    """
    Extrai todo o conteúdo de texto legível de um arquivo PDF
    usando pdfplumber, de forma offline e local.
    """
    text_content = []
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    text_content.append(text)
    except Exception as e:
        print(f"[-] Erro ao ler PDF {pdf_path}: {e}", file=sys.stderr)
        
    return "\n".join(text_content)

def parse_invoice_line(line: str) -> Optional[Dict[str, Any]]:
    """
    Analisa uma linha individual da fatura para identificar data, descrição, parcelas e valor.
    Exemplos de padrões de entrada:
      10/04 TRANSPORTADORA TURISTICA DE JANE-3/3 R$ 52,98
      23/04 LOJAS AMERICANAS R$ 33,78
      20/11 ECOM STN STONE CARREFOURC - 20/20 R$ 259,95
      18/06 DL *SG RIDE, SAO PAULO R$ 28,00
    """
    # Regex flexível para: DD/MM + Descrição + (Opcional: - X/Y ou - X de Y) + Valor (ex: 29,90 ou -12,00)
    pattern = re.compile(
        r"^(\d{2}/\d{2})\s+"                              # 1. Data (DD/MM)
        r"(.+?)"                                          # 2. Descrição
        r"\s+(?:-\s*(\d+)[/\s]*(?:de\s*)?(\d+))?"         # 3 e 4. Opcional: Parcela atual / Total de parcelas
        r"\s+(-?[\d\.]+,\d{2})$"                          # 5. Valor (XX,XX ou -XX,XX)
    )
    
    # Remove prefixos de moedas como "R$" ou "$" para limpeza
    clean_line = re.sub(r"\bR?\$?\s*", "", line.strip())
    match = pattern.search(clean_line)
    
    if not match:
        # Tenta segundo padrão sem o traço das parcelas: "DESCRIÇÃO X/Y VALOR"
        pattern_no_dash = re.compile(
            r"^(\d{2}/\d{2})\s+"
            r"(.+?)"
            r"\s+(\d+)[/\s]+(\d+)"
            r"\s+(-?[\d\.]+,\d{2})$"
        )
        match = pattern_no_dash.search(clean_line)
        if not match:
            return None

    date = match.group(1)
    description = match.group(2).strip()
    curr_installment = match.group(3)
    total_installment = match.group(4)
    value_str = match.group(5).replace(".", "").replace(",", ".")

    try:
        val = float(value_str)
    except ValueError:
        return None

    # Se a descrição tiver traços ou resíduos das parcelas na ponta, limpa
    description = re.sub(r"\s*-\s*$", "", description).strip()

    is_installment = curr_installment is not None and total_installment is not None
    
    return {
        "date": date,
        "description": description,
        "is_installment": is_installment,
        "installment_current": int(curr_installment) if is_installment else None,
        "installment_total": int(total_installment) if is_installment else None,
        "value": val
    }

def process_invoice_file(file_path: str) -> Dict[str, Any]:
    """
    Processa arquivos PDF de faturas extraindo dados textuais localmente.
    Organiza por portadores baseando-se nos nomes encontrados em seções.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Arquivo não localizado: {file_path}")

    text_content = extract_pdf_text(file_path)
    
    result = {
        "nome_banco": "Carrefour Banco", # Default do app
        "data_vencimento": "",
        "valor_total": 0.0,
        "lancamentos_por_portador": {}
    }

    # 1. Tenta identificar o banco do texto
    if "itau" in text_content.lower() or "itaú" in text_content.lower():
        result["nome_banco"] = "Itaú"
    elif "nubank" in text_content.lower():
        result["nome_banco"] = "Nubank"

    # 2. Vencimento
    venc_match = re.search(r"(?:vencimento|vencem\w+|pago em)[:\s]+(\d{2}/\d{2}/\d{4})", text_content, re.IGNORECASE)
    if venc_match:
        result["data_vencimento"] = venc_match.group(1)
    else:
        # Procura por datas soltas no cabeçalho
        venc_match_alt = re.search(r"(\d{2}/\d{2}/\d{4})", text_content)
        if venc_match_alt:
            result["data_vencimento"] = venc_match_alt.group(1)

    # 3. Valor Total
    total_match = re.search(r"(?:total da fatura|valor total|total atual|valor do documento)[:\s]+R?\$?\s*([\d\.]+,\d{2})", text_content, re.IGNORECASE)
    if total_match:
        val_str = total_match.group(1).replace(".", "").replace(",", ".")
        result["valor_total"] = float(val_str)

    # 4. Agrupamento por Portadores conhecidos (Regra híbrida de layout Carrefour)
    portadores_conhecidos = ["SILVIA SILVA", "BARBARA B PIERONI", "JEZIEL SANTOS"]
    portador_atual = "OUTROS"
    result["lancamentos_por_portador"][portador_atual] = []

    lines = text_content.split("\n")
    
    # Se linhas estiverem grudadas com tabulações, tenta dividi-las
    normalized_lines = []
    for line in lines:
        if len(line) > 120 and re.search(r"\d{2}/\d{2}", line):
            parts = line.split("   ")  # divide por espaços grandes
            normalized_lines.extend([p.strip() for p in parts if p.strip()])
        else:
            normalized_lines.append(line)

    for line in normalized_lines:
        cleaned = line.strip()
        if not cleaned:
            continue

        # Verifica mudança de portador
        found_portador = False
        for p in portadores_conhecidos:
            if p in cleaned.upper() and len(cleaned) < 40: # nomes de portadores aparecem sozinhos ou em títulos curtos
                portador_atual = p
                if portador_atual not in result["lancamentos_por_portador"]:
                    result["lancamentos_por_portador"][portador_atual] = []
                found_portador = True
                break

        if found_portador:
            continue

        # Extrai transação se a linha casar
        parsed = parse_invoice_line(cleaned)
        if parsed:
            # Ignora pagamentos, créditos ou descrições indesejadas
            desc_upper = parsed["description"].upper()
            if any(x in desc_upper for x in ["PAGAMENTO EFETUADO", "PAGTO RECEBIDO", "SALDO ANTERIOR", "TOTAL DA FATURA"]):
                continue

            result["lancamentos_por_portador"][portador_atual].append(parsed)

    # Se não achou nenhuma transação, tenta regex simples em todo o texto como fallback
    total_found = sum(len(v) for v in result["lancamentos_por_portador"].values())
    if total_found == 0:
        # Regex global para linhas que contenham datas DD/MM e valores XX,XX na ponta
        fallback_pattern = re.compile(r"(\d{2}/\d{2})\s+([A-Za-z0-9\s\*\-\./#]+?)\s+(-?[\d\.]+,\d{2})")
        for line in normalized_lines:
            match = fallback_pattern.search(line)
            if match:
                date = match.group(1)
                desc = match.group(2).strip()
                val_str = match.group(3).replace(".", "").replace(",", ".")
                if any(x in desc.upper() for x in ["PAGAMENTO", "RECEBIDO", "SALDO"]):
                    continue
                try:
                    val = float(val_str)
                    result["lancamentos_por_portador"]["OUTROS"].append({
                        "date": date,
                        "description": desc,
                        "is_installment": False,
                        "installment_current": None,
                        "installment_total": None,
                        "value": val
                    })
                except ValueError:
                    pass

    # Calcula valor total somando transações se o total principal for zero
    if result["valor_total"] == 0.0:
        total_sum = 0.0
        for portador, compras in result["lancamentos_por_portador"].items():
            for c in compras:
                total_sum += c["value"]
        result["valor_total"] = round(total_sum, 2)

    return result

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python parser.py <caminho_da_fatura_pdf>")
        sys.exit(1)
        
    input_file = sys.argv[1]
    try:
        data = process_invoice_file(input_file)
        print(json.dumps(data, indent=2, ensure_ascii=False))
    except Exception as err:
        print(json.dumps({"error": str(err)}))
