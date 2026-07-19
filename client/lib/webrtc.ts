import socket from "./socket";
import type { NetworkPacket } from "@/types/network";

class WebRTCManager {
    peerConnection: RTCPeerConnection | null =
        null;

    dataChannel: RTCDataChannel | null =
        null;

    targetSocketId: string | null = null;

    listeners: ((
        packet: NetworkPacket,
    ) => void)[] = [];

    onMessage(
        callback: (
            packet: NetworkPacket,
        ) => void,
    ) {
        this.listeners.push(callback);
    }

    async initialize() {
        this.peerConnection =
            new RTCPeerConnection({
                iceServers: [
                    {
                        urls: "stun:stun.l.google.com:19302",
                    },
                ],
            });

        this.peerConnection.onicecandidate = (
            event,
        ) => {
            if (
                event.candidate &&
                this.targetSocketId
            ) {
                socket.emit("iceCandidate", {
                    targetSocketId:
                        this.targetSocketId,

                    candidate: event.candidate,
                });
            }
        };

        this.peerConnection.ondatachannel = (
            event,
        ) => {
            console.log(
                "DATA CHANNEL RECEIVED",
            );

            this.setupDataChannel(
                event.channel,
            );
        };

        socket.on(
            "offer",
            async ({ from, offer }) => {
                this.targetSocketId = from;

                if (!this.peerConnection)
                    return;

                await this.peerConnection.setRemoteDescription(
                    new RTCSessionDescription(
                        offer,
                    ),
                );

                const answer =
                    await this.peerConnection.createAnswer();

                await this.peerConnection.setLocalDescription(
                    answer,
                );

                socket.emit("answer", {
                    targetSocketId: from,
                    answer,
                });
            },
        );

        socket.on(
            "answer",
            async ({ answer }) => {
                if (!this.peerConnection)
                    return;

                await this.peerConnection.setRemoteDescription(
                    new RTCSessionDescription(
                        answer,
                    ),
                );
            },
        );

        socket.on(
            "iceCandidate",
            async ({ candidate }) => {
                try {
                    await this.peerConnection?.addIceCandidate(
                        new RTCIceCandidate(
                            candidate,
                        ),
                    );
                } catch (err) {
                    console.error(err);
                }
            },
        );
    }

    setupDataChannel(
        channel: RTCDataChannel,
    ) {
        this.dataChannel = channel;

        channel.onopen = () => {
            console.log(
                "WEBRTC DATA CHANNEL OPEN",
            );
        };

        channel.onmessage = (event) => {
            try {
                const packet: NetworkPacket =
                    JSON.parse(event.data);

                for (const listener of this
                    .listeners) {
                    listener(packet);
                }
            } catch (err) {
                console.error(
                    "Failed to parse RTC packet",
                    err,
                );
            }
        };
    }

    async createOffer(
        targetSocketId: string,
    ) {
        if (!this.peerConnection) return;

        this.targetSocketId =
            targetSocketId;

        const channel =
            this.peerConnection.createDataChannel(
                "gameData",
            );

        this.setupDataChannel(channel);

        const offer =
            await this.peerConnection.createOffer();

        await this.peerConnection.setLocalDescription(
            offer,
        );

        socket.emit("offer", {
            targetSocketId,
            offer,
        });
    }

    send(data: any) {
        if (
            this.dataChannel?.readyState ===
            "open"
        ) {
            this.dataChannel.send(
                JSON.stringify(data),
            );
        }
    }
}

export const webrtc =
    new WebRTCManager();