"""
cTrader Open API v2 Async Client
Pure AsyncIO TLS Protobuf client for Spotware Open API (Demo & Live).
Author: Advanced Agentic Trading System
"""

import asyncio
import ssl
import struct
import sys
import os
import uuid
import time
from typing import Dict, Any, List, Optional, Callable

# Ensure protobuf messages are imported cleanly
sys.path.insert(0, os.path.dirname(__file__))
from ctrader_open_api.messages import OpenApiCommonMessages_pb2 as common_msg
from ctrader_open_api.messages import OpenApiCommonModelMessages_pb2 as common_model
from ctrader_open_api.messages import OpenApiModelMessages_pb2 as model_msg
from ctrader_open_api.messages import OpenApiMessages_pb2 as msg

class CTraderOpenAPIClient:
    def __init__(self, environment: str = "demo", timeout: float = 15.0):
        self.environment = environment.lower().strip()
        self.host = "live.ctraderapi.com" if self.environment == "live" else "demo.ctraderapi.com"
        self.port = 5035
        self.timeout = timeout
        
        self.reader: Optional[asyncio.StreamReader] = None
        self.writer: Optional[asyncio.StreamWriter] = None
        self.is_connected = False
        
        self._pending_requests: Dict[str, asyncio.Future] = {}
        self._listener_task: Optional[asyncio.Task] = None
        self._event_handlers: Dict[int, List[Callable]] = {}
        self._heartbeat_task: Optional[asyncio.Task] = None

    async def connect(self, max_retries: int = 3):
        """Establishes a secure TLS socket connection to cTrader Open API with retry logic."""
        ssl_ctx = ssl.create_default_context()
        last_ex = None
        for attempt in range(1, max_retries + 1):
            try:
                self.reader, self.writer = await asyncio.open_connection(
                    self.host, self.port, ssl=ssl_ctx, server_hostname=self.host
                )
                self.is_connected = True
                self._listener_task = asyncio.create_task(self._listen_loop())
                self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
                return
            except Exception as ex:
                last_ex = ex
                if attempt < max_retries:
                    await asyncio.sleep(1.0)
        raise ConnectionError(f"Failed to connect to {self.host}:{self.port} after {max_retries} attempts: {last_ex}")

    async def disconnect(self):
        """Closes the TLS socket connection cleanly."""
        self.is_connected = False
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
        if self._listener_task:
            self._listener_task.cancel()
        if self.writer:
            try:
                self.writer.close()
                await self.writer.wait_closed()
            except Exception:
                pass
        self.writer = None
        self.reader = None

    def on_event(self, payload_type: int, callback: Callable):
        """Registers a callback handler for asynchronous push events (e.g. spot ticks, execution events)."""
        if payload_type not in self._event_handlers:
            self._event_handlers[payload_type] = []
        self._event_handlers[payload_type].append(callback)

    async def _send_request(self, payload_type: int, inner_msg, client_msg_id: Optional[str] = None) -> Any:
        """Encapsulates and transmits a ProtoMessage over TLS with length-prefix framing."""
        if not self.is_connected or not self.writer:
            raise ConnectionError("cTrader Open API Client is not connected.")

        msg_id = client_msg_id or str(uuid.uuid4())
        proto = common_msg.ProtoMessage()
        proto.payloadType = payload_type
        proto.payload = inner_msg.SerializeToString()
        proto.clientMsgId = msg_id

        future = asyncio.get_event_loop().create_future()
        self._pending_requests[msg_id] = future

        msg_bytes = proto.SerializeToString()
        header = struct.pack(">I", len(msg_bytes))
        
        self.writer.write(header + msg_bytes)
        await self.writer.drain()

        try:
            return await asyncio.wait_for(future, timeout=self.timeout)
        finally:
            self._pending_requests.pop(msg_id, None)

    async def _listen_loop(self):
        """Continuously reads framed messages from the TLS socket."""
        try:
            while self.is_connected and self.reader:
                len_bytes = await self.reader.readexactly(4)
                if not len_bytes:
                    break
                length = struct.unpack(">I", len_bytes)[0]
                
                payload_bytes = await self.reader.readexactly(length)
                proto = common_msg.ProtoMessage()
                proto.ParseFromString(payload_bytes)

                pt = proto.payloadType
                client_id = proto.clientMsgId

                # Check if this message resolves a pending request
                if client_id and client_id in self._pending_requests:
                    future = self._pending_requests[client_id]
                    if not future.done():
                        future.set_result((pt, proto.payload))

                # Dispatch event handlers
                if pt in self._event_handlers:
                    for handler in self._event_handlers[pt]:
                        try:
                            if asyncio.iscoroutinefunction(handler):
                                asyncio.create_task(handler(pt, proto.payload))
                            else:
                                handler(pt, proto.payload)
                        except Exception as ex:
                            print(f"[Event Handler Error] {ex}")

        except (asyncio.CancelledError, asyncio.IncompleteReadError):
            pass
        except Exception as ex:
            if self.is_connected:
                print(f"[Socket Listener Exception] {ex}")
        finally:
            self.is_connected = False

    async def _heartbeat_loop(self):
        """Sends periodic ProtoHeartbeatEvent to keep the connection alive."""
        try:
            while self.is_connected and self.writer:
                await asyncio.sleep(20)
                if not self.is_connected or not self.writer:
                    break
                hb = common_msg.ProtoHeartbeatEvent()
                proto = common_msg.ProtoMessage()
                proto.payloadType = common_model.HEARTBEAT_EVENT
                proto.payload = hb.SerializeToString()
                proto.clientMsgId = str(uuid.uuid4())
                
                b = proto.SerializeToString()
                self.writer.write(struct.pack(">I", len(b)) + b)
                await self.writer.drain()
        except asyncio.CancelledError:
            pass
        except Exception:
            pass

    # --- High-Level API Methods ---

    async def authorize_application(self, client_id: str, client_secret: str) -> msg.ProtoOAApplicationAuthRes:
        """Authenticates the application (App Auth)."""
        req = msg.ProtoOAApplicationAuthReq()
        req.clientId = client_id
        req.clientSecret = client_secret
        
        pt, raw = await self._send_request(model_msg.PROTO_OA_APPLICATION_AUTH_REQ, req)
        if pt == model_msg.PROTO_OA_APPLICATION_AUTH_RES:
            res = msg.ProtoOAApplicationAuthRes()
            res.ParseFromString(raw)
            return res
        elif pt == model_msg.PROTO_OA_ERROR_RES:
            err = msg.ProtoOAErrorRes()
            err.ParseFromString(raw)
            raise ValueError(f"Application Auth Error: {err.errorCode} - {err.description}")
        else:
            raise ValueError(f"Unexpected response payloadType: {pt}")

    async def get_accounts_by_access_token(self, access_token: str) -> List[Any]:
        """Retrieves all linked trading accounts for the given OAuth2 access token."""
        req = msg.ProtoOAGetAccountListByAccessTokenReq()
        req.accessToken = access_token
        
        pt, raw = await self._send_request(model_msg.PROTO_OA_GET_ACCOUNTS_BY_ACCESS_TOKEN_REQ, req)
        if pt == model_msg.PROTO_OA_GET_ACCOUNTS_BY_ACCESS_TOKEN_RES:
            res = msg.ProtoOAGetAccountListByAccessTokenRes()
            res.ParseFromString(raw)
            return list(res.ctidTraderAccount)
        elif pt == model_msg.PROTO_OA_ERROR_RES:
            err = msg.ProtoOAErrorRes()
            err.ParseFromString(raw)
            raise ValueError(f"Get Accounts Error: {err.errorCode} - {err.description}")
        else:
            raise ValueError(f"Unexpected response payloadType: {pt}")

    async def authorize_account(self, account_id: int, access_token: str) -> msg.ProtoOAAccountAuthRes:
        """Authorizes a specific trading account (Account Auth)."""
        req = msg.ProtoOAAccountAuthReq()
        req.ctidTraderAccountId = int(account_id)
        req.accessToken = access_token
        
        pt, raw = await self._send_request(model_msg.PROTO_OA_ACCOUNT_AUTH_REQ, req)
        if pt == model_msg.PROTO_OA_ACCOUNT_AUTH_RES:
            res = msg.ProtoOAAccountAuthRes()
            res.ParseFromString(raw)
            return res
        elif pt == model_msg.PROTO_OA_ERROR_RES:
            err = msg.ProtoOAErrorRes()
            err.ParseFromString(raw)
            raise ValueError(f"Account Auth Error: {err.errorCode} - {err.description}")
        else:
            raise ValueError(f"Unexpected response payloadType: {pt}")

    async def get_trader_profile(self, account_id: int) -> model_msg.ProtoOATrader:
        """Fetches account balance, equity, leverage, currency, and trader profile."""
        req = msg.ProtoOATraderReq()
        req.ctidTraderAccountId = int(account_id)
        
        pt, raw = await self._send_request(model_msg.PROTO_OA_TRADER_REQ, req)
        if pt == model_msg.PROTO_OA_TRADER_RES:
            res = msg.ProtoOATraderRes()
            res.ParseFromString(raw)
            return res.trader
        elif pt == model_msg.PROTO_OA_ERROR_RES:
            err = msg.ProtoOAErrorRes()
            err.ParseFromString(raw)
            raise ValueError(f"Trader Profile Error: {err.errorCode} - {err.description}")
        else:
            raise ValueError(f"Unexpected response payloadType: {pt}")

    async def get_symbols_list(self, account_id: int, include_archived: bool = False) -> List[Any]:
        """Fetches the list of all available tradable symbols for this broker."""
        req = msg.ProtoOASymbolsListReq()
        req.ctidTraderAccountId = int(account_id)
        req.includeArchivedSymbols = include_archived
        
        pt, raw = await self._send_request(model_msg.PROTO_OA_SYMBOLS_LIST_REQ, req)
        if pt == model_msg.PROTO_OA_SYMBOLS_LIST_RES:
            res = msg.ProtoOASymbolsListRes()
            res.ParseFromString(raw)
            return list(res.symbol)
        elif pt == model_msg.PROTO_OA_ERROR_RES:
            err = msg.ProtoOAErrorRes()
            err.ParseFromString(raw)
            raise ValueError(f"Symbols List Error: {err.errorCode} - {err.description}")
        else:
            raise ValueError(f"Unexpected response payloadType: {pt}")

    async def reconcile_positions(self, account_id: int) -> msg.ProtoOAReconcileRes:
        """Reconciles and returns all open positions and pending orders."""
        req = msg.ProtoOAReconcileReq()
        req.ctidTraderAccountId = int(account_id)
        
        pt, raw = await self._send_request(model_msg.PROTO_OA_RECONCILE_REQ, req)
        if pt == model_msg.PROTO_OA_RECONCILE_RES:
            res = msg.ProtoOAReconcileRes()
            res.ParseFromString(raw)
            return res
        elif pt == model_msg.PROTO_OA_ERROR_RES:
            err = msg.ProtoOAErrorRes()
            err.ParseFromString(raw)
            raise ValueError(f"Reconcile Positions Error: {err.errorCode} - {err.description}")
        else:
            raise ValueError(f"Unexpected response payloadType: {pt}")

    async def get_position_unrealized_pnl(self, account_id: int) -> msg.ProtoOAGetPositionUnrealizedPnLRes:
        """Fetches broker-calculated gross and net unrealized PnL for all active positions."""
        req = msg.ProtoOAGetPositionUnrealizedPnLReq()
        req.ctidTraderAccountId = int(account_id)
        
        pt, raw = await self._send_request(model_msg.PROTO_OA_GET_POSITION_UNREALIZED_PNL_REQ, req)
        if pt == model_msg.PROTO_OA_GET_POSITION_UNREALIZED_PNL_RES:
            res = msg.ProtoOAGetPositionUnrealizedPnLRes()
            res.ParseFromString(raw)
            return res
        elif pt == model_msg.PROTO_OA_ERROR_RES:
            err = msg.ProtoOAErrorRes()
            err.ParseFromString(raw)
            raise ValueError(f"Get Unrealized PnL Error: {err.errorCode} - {err.description}")
        else:
            raise ValueError(f"Unexpected response payloadType: {pt}")

    async def get_deal_list(self, account_id: int, from_timestamp: int, to_timestamp: int, max_rows: int = 200) -> msg.ProtoOADealListRes:
        """Fetches deal list (executions and position closures) within a time window."""
        req = msg.ProtoOADealListReq()
        req.ctidTraderAccountId = int(account_id)
        req.fromTimestamp = int(from_timestamp)
        req.toTimestamp = int(to_timestamp)
        req.maxRows = int(max_rows)
        
        pt, raw = await self._send_request(model_msg.PROTO_OA_DEAL_LIST_REQ, req)
        if pt == model_msg.PROTO_OA_DEAL_LIST_RES:
            res = msg.ProtoOADealListRes()
            res.ParseFromString(raw)
            return res
        elif pt == model_msg.PROTO_OA_ERROR_RES:
            err = msg.ProtoOAErrorRes()
            err.ParseFromString(raw)
            raise ValueError(f"Get Deal List Error: {err.errorCode} - {err.description}")
        else:
            raise ValueError(f"Unexpected response payloadType: {pt}")

    async def subscribe_spots(self, account_id: int, symbol_ids: List[int]) -> msg.ProtoOASubscribeSpotsRes:
        """Subscribes to live real-time spot price tick feeds for specified symbol IDs."""
        req = msg.ProtoOASubscribeSpotsReq()
        req.ctidTraderAccountId = int(account_id)
        req.symbolId.extend([int(s) for s in symbol_ids])
        
        pt, raw = await self._send_request(model_msg.PROTO_OA_SUBSCRIBE_SPOTS_REQ, req)
        if pt == model_msg.PROTO_OA_SUBSCRIBE_SPOTS_RES:
            res = msg.ProtoOASubscribeSpotsRes()
            res.ParseFromString(raw)
            return res
        elif pt == model_msg.PROTO_OA_ERROR_RES:
            err = msg.ProtoOAErrorRes()
            err.ParseFromString(raw)
            raise ValueError(f"Subscribe Spots Error: {err.errorCode} - {err.description}")
        else:
            raise ValueError(f"Unexpected response payloadType: {pt}")

    async def unsubscribe_spots(self, account_id: int, symbol_ids: List[int]):
        """Unsubscribes from spot price tick feeds."""
        req = msg.ProtoOAUnsubscribeSpotsReq()
        req.ctidTraderAccountId = int(account_id)
        req.symbolId.extend([int(s) for s in symbol_ids])
        await self._send_request(model_msg.PROTO_OA_UNSUBSCRIBE_SPOTS_REQ, req)

    async def create_market_order(self, account_id: int, symbol_id: int, trade_side: str, volume_units: int, comment: str = "Test Open API") -> msg.ProtoOAExecutionEvent:
        """Executes a market order (BUY / SELL) via cTrader Open API."""
        req = msg.ProtoOANewOrderReq()
        req.ctidTraderAccountId = int(account_id)
        req.symbolId = int(symbol_id)
        req.orderType = model_msg.MARKET
        req.tradeSide = model_msg.BUY if trade_side.upper() == "BUY" else model_msg.SELL
        req.volume = int(volume_units)
        req.comment = comment
        
        pt, raw = await self._send_request(model_msg.PROTO_OA_NEW_ORDER_REQ, req)
        if pt == model_msg.PROTO_OA_EXECUTION_EVENT:
            res = msg.ProtoOAExecutionEvent()
            res.ParseFromString(raw)
            return res
        elif pt == model_msg.PROTO_OA_ORDER_ERROR_EVENT:
            err = msg.ProtoOAOrderErrorEvent()
            err.ParseFromString(raw)
            raise ValueError(f"New Order Failed: {err.errorCode} - {err.description}")
        elif pt == model_msg.PROTO_OA_ERROR_RES:
            err = msg.ProtoOAErrorRes()
            err.ParseFromString(raw)
            raise ValueError(f"New Order Error: {err.errorCode} - {err.description}")
        else:
            raise ValueError(f"Unexpected response payloadType: {pt}")

    async def close_position(self, account_id: int, position_id: int, volume_units: int) -> msg.ProtoOAExecutionEvent:
        """Closes an active position via cTrader Open API."""
        req = msg.ProtoOAClosePositionReq()
        req.ctidTraderAccountId = int(account_id)
        req.positionId = int(position_id)
        req.volume = int(volume_units)
        
        pt, raw = await self._send_request(model_msg.PROTO_OA_CLOSE_POSITION_REQ, req)
        if pt == model_msg.PROTO_OA_EXECUTION_EVENT:
            res = msg.ProtoOAExecutionEvent()
            res.ParseFromString(raw)
            return res
        elif pt == model_msg.PROTO_OA_ORDER_ERROR_EVENT:
            err = msg.ProtoOAOrderErrorEvent()
            err.ParseFromString(raw)
            raise ValueError(f"Close Position Failed: {err.errorCode} - {err.description}")
        elif pt == model_msg.PROTO_OA_ERROR_RES:
            err = msg.ProtoOAErrorRes()
            err.ParseFromString(raw)
            raise ValueError(f"Close Position Error: {err.errorCode} - {err.description}")
        else:
            raise ValueError(f"Unexpected response payloadType: {pt}")
