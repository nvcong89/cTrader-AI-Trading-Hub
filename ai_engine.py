"""
AI Engine - Multi-Provider REST API Client for cTrader AI Co-Pilot
===================================================================
Provides asynchronous API integrations for:
- Alibaba Qwen (DashScope / OpenAI-Compatible)
- DeepSeek (Chat Completions)
- Google Gemini REST API (v1beta)
- OpenAI (GPT-4o, GPT-4o-mini)
"""

import json
import re
import time
import httpx
from typing import Dict, Any, Tuple, Optional
from database import log_message

def parse_agent_decision(raw_text: str) -> Dict[str, Any]:
    """
    Extracts and parses JSON decision block from LLM output with robust regex and fallback.
    """
    clean_text = raw_text.strip()
    
    # Try finding markdown JSON block ```json ... ```
    json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', clean_text, re.DOTALL)
    if json_match:
        json_str = json_match.group(1)
    else:
        # Try finding raw JSON object
        brace_match = re.search(r'(\{[\s\S]*\})', clean_text)
        if brace_match:
            json_str = brace_match.group(1)
        else:
            json_str = clean_text

    try:
        decision = json.loads(json_str)
        # Normalize fields
        action = str(decision.get("action", "HOLD")).upper().strip()
        if action not in ["BUY", "SELL", "HOLD", "ADJUST", "CLOSE_ALL"]:
            action = "HOLD"
            
        return {
            "action": action,
            "volume_lots": float(decision.get("volume_lots", 0.01)),
            "sl_pips": float(decision.get("sl_pips", 0.0) or 0.0),
            "tp_pips": float(decision.get("tp_pips", 0.0) or 0.0),
            "new_sl_price": float(decision.get("new_sl_price", 0.0) or 0.0),
            "new_tp_price": float(decision.get("new_tp_price", 0.0) or 0.0),
            "reason": str(decision.get("reason", "Decision processed")),
            "confidence": float(decision.get("confidence", 80.0))
        }
    except Exception as e:
        log_message("AI_ENGINE", "WARN", f"Failed to parse JSON decision from LLM: {str(e)} | Raw: {clean_text[:200]}")
        return {
            "action": "HOLD",
            "volume_lots": 0.01,
            "sl_pips": 0.0,
            "tp_pips": 0.0,
            "new_sl_price": 0.0,
            "new_tp_price": 0.0,
            "reason": f"Parsing Error: {str(e)}. Holding position for safety.",
            "confidence": 0.0
        }

async def query_gemini_api(api_key: str, model: str, prompt_text: str) -> Tuple[Dict[str, Any], str]:
    """
    Calls official Google Gemini REST API.
    """
    if not api_key:
        raise ValueError("Google Gemini API Key is missing. Please configure it in the Agent tab.")

    model_name = model.strip() if model else "gemini-1.5-flash"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
    
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt_text}
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json"
        }
    }
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(url, json=payload)
        if res.status_code != 200:
            err_msg = res.text
            try:
                err_json = res.json()
                err_msg = err_json.get("error", {}).get("message", res.text)
            except Exception:
                pass
            raise ValueError(f"Gemini API Error ({res.status_code}): {err_msg}")
            
        data = res.json()
        raw_output = data["candidates"][0]["content"]["parts"][0]["text"]
        decision = parse_agent_decision(raw_output)
        return decision, raw_output

async def query_deepseek_api(api_key: str, model: str, prompt_text: str) -> Tuple[Dict[str, Any], str]:
    """
    Calls DeepSeek API (OpenAI-compatible chat completion).
    """
    if not api_key:
        raise ValueError("DeepSeek API Key is missing. Please configure it in the Agent tab.")

    model_name = model.strip() if model else "deepseek-chat"
    url = "https://api.deepseek.com/chat/completions"
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": "You are a specialized Algorithmic Trading AI Co-Pilot for cTrader. You analyze market snapshots and output strictly valid JSON format: {\"action\": \"BUY\"|\"SELL\"|\"HOLD\"|\"ADJUST\"|\"CLOSE_ALL\", \"volume_lots\": 0.01, \"sl_pips\": 150, \"tp_pips\": 300, \"reason\": \"...\", \"confidence\": 85.0}."},
            {"role": "user", "content": prompt_text}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2
    }
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(url, headers=headers, json=payload)
        if res.status_code != 200:
            err_msg = res.text
            try:
                err_json = res.json()
                err_msg = err_json.get("error", {}).get("message", res.text)
            except Exception:
                pass
            raise ValueError(f"DeepSeek API Error ({res.status_code}): {err_msg}")
            
        data = res.json()
        raw_output = data["choices"][0]["message"]["content"]
        decision = parse_agent_decision(raw_output)
        return decision, raw_output

async def query_openai_api(api_key: str, model: str, prompt_text: str) -> Tuple[Dict[str, Any], str]:
    """
    Calls OpenAI Chat Completions API.
    """
    if not api_key:
        raise ValueError("OpenAI API Key is missing. Please configure it in the Agent tab.")

    model_name = model.strip() if model else "gpt-4o-mini"
    url = "https://api.openai.com/v1/chat/completions"
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": "You are a specialized Algorithmic Trading AI Co-Pilot for cTrader. Output strictly valid JSON format."},
            {"role": "user", "content": prompt_text}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2
    }
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(url, headers=headers, json=payload)
        if res.status_code != 200:
            err_msg = res.text
            try:
                err_json = res.json()
                err_msg = err_json.get("error", {}).get("message", res.text)
            except Exception:
                pass
            raise ValueError(f"OpenAI API Error ({res.status_code}): {err_msg}")
            
        data = res.json()
        raw_output = data["choices"][0]["message"]["content"]
        decision = parse_agent_decision(raw_output)
        return decision, raw_output

async def query_qwen_api(api_key: str, model: str, prompt_text: str, endpoint: Optional[str] = None) -> Tuple[Dict[str, Any], str]:
    """
    Calls Alibaba Qwen API (DashScope or any OpenAI-compatible endpoint).
    """
    if not api_key:
        raise ValueError("Qwen / OpenAI Compatible API Key is missing. Please configure it in the Agent tab.")

    model_name = model.strip() if model else "qwen3.7-flash"
    base_endpoint = endpoint.strip() if endpoint else "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    
    if not base_endpoint.endswith("/chat/completions"):
        url = f"{base_endpoint.rstrip('/')}/chat/completions"
    else:
        url = base_endpoint
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": "You are a specialized Algorithmic Trading AI Co-Pilot for cTrader. You analyze market snapshots and output strictly valid JSON format: {\"action\": \"BUY\"|\"SELL\"|\"HOLD\"|\"ADJUST\"|\"CLOSE_ALL\", \"volume_lots\": 0.01, \"sl_pips\": 150, \"tp_pips\": 300, \"reason\": \"...\", \"confidence\": 85.0}."},
            {"role": "user", "content": prompt_text}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2
    }
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(url, headers=headers, json=payload)
        if res.status_code != 200:
            err_msg = res.text
            try:
                err_json = res.json()
                err_msg = err_json.get("error", {}).get("message", res.text)
            except Exception:
                pass
            raise ValueError(f"Qwen API Error ({res.status_code}): {err_msg}")

        data = res.json()
        raw_output = data["choices"][0]["message"]["content"]
        decision = parse_agent_decision(raw_output)
        return decision, raw_output

async def dispatch_ai_trade(config: Dict[str, Any], page=None, prompt_text: str = "") -> Tuple[Dict[str, Any], str, float]:
    """
    Dispatches prompt to the active AI REST API provider and measures response latency.
    """
    provider = config.get("active_provider", "qwen_api")
    start_time = time.time()
    
    if provider == "gemini_api":
        decision, raw = await query_gemini_api(config.get("gemini_api_key", ""), config.get("gemini_model", "gemini-1.5-flash"), prompt_text)
    elif provider == "deepseek_api":
        decision, raw = await query_deepseek_api(config.get("deepseek_api_key", ""), config.get("deepseek_model", "deepseek-chat"), prompt_text)
    elif provider == "openai_api":
        decision, raw = await query_openai_api(config.get("openai_api_key", ""), config.get("openai_model", "gpt-4o-mini"), prompt_text)
    else: # Default qwen_api
        decision, raw = await query_qwen_api(
            config.get("qwen_api_key", ""),
            config.get("qwen_model", "qwen3.7-flash"),
            prompt_text,
            config.get("qwen_endpoint", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1")
        )
        
    latency_ms = round((time.time() - start_time) * 1000, 1)
    return decision, raw, latency_ms

async def test_ai_provider_connection(provider: str, api_key: str, model: str, page=None, endpoint: Optional[str] = None) -> Dict[str, Any]:
    """
    Performs a live test ping against the specified AI provider with a sample market prompt.
    """
    sample_prompt = (
        "Market snapshot test: Symbol: XAUUSD, Ask: 2650.50, Bid: 2650.35, RSI: 58.2, Trend: Bullish.\n"
        "Return a strictly valid JSON decision: {\"action\": \"HOLD\", \"volume_lots\": 0.01, \"sl_pips\": 150.0, \"tp_pips\": 300.0, \"reason\": \"Test connection verified successfully\", \"confidence\": 95.0}"
    )
    
    start_time = time.time()
    try:
        if provider == "gemini_api":
            decision, raw = await query_gemini_api(api_key, model, sample_prompt)
        elif provider == "deepseek_api":
            decision, raw = await query_deepseek_api(api_key, model, sample_prompt)
        elif provider == "openai_api":
            decision, raw = await query_openai_api(api_key, model, sample_prompt)
        elif provider == "qwen_api":
            decision, raw = await query_qwen_api(api_key, model, sample_prompt, endpoint)
        else:
            raise ValueError(f"Unknown AI Provider: {provider}")
            
        latency_ms = round((time.time() - start_time) * 1000, 1)
        return {
            "status": "success",
            "provider": provider,
            "model": model,
            "latency_ms": latency_ms,
            "decision": decision,
            "raw_preview": raw[:300] if raw else ""
        }
    except Exception as e:
        latency_ms = round((time.time() - start_time) * 1000, 1)
        return {
            "status": "error",
            "provider": provider,
            "model": model,
            "latency_ms": latency_ms,
            "message": str(e)
        }

async def query_llm_text(config: Dict[str, Any], system_prompt: str, user_prompt: str, temperature: float = 0.4) -> Tuple[str, float]:
    """
    General text / markdown reasoning generator supporting all configured AI providers.
    """
    provider = config.get("active_provider", "qwen_api")
    start_time = time.time()
    
    if provider == "gemini_api":
        api_key = config.get("gemini_api_key", "")
        if not api_key:
            raise ValueError("Gemini API key is not configured in Agent tab.")
        model_name = config.get("gemini_model", "gemini-1.5-flash")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": f"{system_prompt}\n\n{user_prompt}"}
                    ]
                }
            ],
            "generationConfig": {
                "temperature": temperature
            }
        }
        async with httpx.AsyncClient(timeout=90.0) as client:
            res = await client.post(url, json=payload)
            if res.status_code != 200:
                raise ValueError(f"Gemini API Error ({res.status_code}): {res.text}")
            data = res.json()
            raw_output = data["candidates"][0]["content"]["parts"][0]["text"]
            
    elif provider == "deepseek_api":
        api_key = config.get("deepseek_api_key", "")
        if not api_key:
            raise ValueError("DeepSeek API key is not configured in Agent tab.")
        model_name = config.get("deepseek_model", "deepseek-chat")
        url = "https://api.deepseek.com/v1/chat/completions"
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": temperature
        }
        async with httpx.AsyncClient(timeout=90.0) as client:
            res = await client.post(url, headers=headers, json=payload)
            if res.status_code != 200:
                raise ValueError(f"DeepSeek API Error ({res.status_code}): {res.text}")
            data = res.json()
            raw_output = data["choices"][0]["message"]["content"]

    elif provider == "openai_api":
        api_key = config.get("openai_api_key", "")
        if not api_key:
            raise ValueError("OpenAI API key is not configured in Agent tab.")
        model_name = config.get("openai_model", "gpt-4o-mini")
        url = "https://api.openai.com/v1/chat/completions"
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": temperature
        }
        async with httpx.AsyncClient(timeout=90.0) as client:
            res = await client.post(url, headers=headers, json=payload)
            if res.status_code != 200:
                raise ValueError(f"OpenAI API Error ({res.status_code}): {res.text}")
            data = res.json()
            raw_output = data["choices"][0]["message"]["content"]

    else: # Default qwen_api
        api_key = config.get("qwen_api_key", "")
        if not api_key:
            raise ValueError("Qwen / OpenAI Compatible API key is not configured in Agent tab.")
        model_name = config.get("qwen_model", "qwen3.7-flash")
        base_endpoint = config.get("qwen_endpoint", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1")
        if not base_endpoint.endswith("/chat/completions"):
            url = f"{base_endpoint.rstrip('/')}/chat/completions"
        else:
            url = base_endpoint
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": temperature
        }
        async with httpx.AsyncClient(timeout=90.0) as client:
            res = await client.post(url, headers=headers, json=payload)
            if res.status_code != 200:
                raise ValueError(f"Qwen API Error ({res.status_code}): {res.text}")
            data = res.json()
            raw_output = data["choices"][0]["message"]["content"]

    latency_ms = round((time.time() - start_time) * 1000, 1)
    return raw_output.strip(), latency_ms

