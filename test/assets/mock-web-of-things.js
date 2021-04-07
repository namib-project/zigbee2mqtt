const thingDescription = {
    "@context": ["http://www.w3.org/ns/td"],
    "@type": "ThingModel",
    title: "OSRAM Classic A60 RGBW",
    id: "urn:zigbee2mqtt:0x000b57fffec6a5b2",
    base: "mqtt://{{MQTT_BROKER_ADDRESS}}",
    securityDefinitions: {
        nosec_sc: {
            scheme: "nosec",
        },
    },
    security: "nosec_sc",
    properties: {
        transition: {
            type: "number",
            writeOnly: true,
            minimum: 0,
            forms: [
                {
                    op: "writeproperty",
                    href: "zigbee2mqtt/{{FRIENDLY_NAME}}/set/set_transition",
                },
            ],
        },
        rememberState: {
            type: "boolean",
            writeOnly: true,
            forms: [
                {
                    href: "zigbee2mqtt/{{FRIENDLY_NAME}}/set/remember_state",
                    op: "writeproperty",
                },
            ],
        },
        state: {
            title: "state",
            description: "On/off state of this light",
            type: "object",
            readOnly: true,
            properties: {
                state: {
                    type: "string",
                    enum: ["ON", "OFF"],
                },
            },
            required: ["state"],
            forms: [
                {
                    op: ["observeproperty", "unobserveproperty"],
                    href: "zigbee2mqtt/{{FRIENDLY_NAME}}",
                },
                {
                    op: "readproperty",
                    href: "zigbee2mqtt/{{FRIENDLY_NAME}}/get/state",
                    "mqv:responseTopic": "zigbee2mqtt/{{FRIENDLY_NAME}}",
                },
            ],
        },
        brightness: {
            title: "brightness",
            description: "Brightness of this light",
            type: "object",
            properties: {
                brightness: {
                    type: "number",
                    minimum: 0,
                    maximum: 254,
                },
                transition: {
                    type: "number",
                    minimum: 0,
                },
            },
            required: ["brightness"],
            forms: [
                {
                    op: ["observeproperty", "unobserveproperty"],
                    href: "zigbee2mqtt/{{FRIENDLY_NAME}}",
                },
                {
                    op: ["writeproperty"],
                    href: "zigbee2mqtt/{{FRIENDLY_NAME}}/set",
                },
                {
                    op: "readproperty",
                    href: "zigbee2mqtt/{{FRIENDLY_NAME}}/get/state",
                    "mqv:responseTopic": "zigbee2mqtt/{{FRIENDLY_NAME}}",
                },
            ],
        },
        linkquality: {
            type: "object",
            properties: {
                linkquality: {
                    type: "number",
                    minimum: 0,
                    maximum: 255,
                    unit: "lqi",
                },
            },
            required: ["linkquality"],
            forms: [
                {
                    op: ["observeproperty", "unobserveproperty"],
                    href: "zigbee2mqtt/{{FRIENDLY_NAME}}",
                },
            ],
        },
    },
    actions: {
        toggle: {
            input: {
                type: "string",
                const: "TOGGLE",
            },
            forms: [
                {
                    op: "invokeaction",
                    href: "zigbee2mqtt/{{FRIENDLY_NAME}}/set/state",
                },
            ],
        },
        on: {
            input: {
                type: "string",
                const: "ON",
            },
            forms: [
                {
                    op: "invokeaction",
                    href: "zigbee2mqtt/{{FRIENDLY_NAME}}/set/state",
                },
            ],
        },
        off: {
            input: {
                type: "string",
                const: "OFF",
            },
            forms: [
                {
                    op: "invokeaction",
                    href: "zigbee2mqtt/{{FRIENDLY_NAME}}/set/state",
                },
            ],
        },
        effect: {
            type: "string",
            enum: [
                "blink",
                "breathe",
                "okay",
                "channel_change",
                "finish_effect",
                "stop_effect",
            ],
            forms: [
                {
                    op: "invokeaction",
                    href: "zigbee2mqtt/{{FRIENDLY_NAME}}/set/effect",
                },
            ],
        },
    },
    events: {},
};

module.exports = thingDescription;
