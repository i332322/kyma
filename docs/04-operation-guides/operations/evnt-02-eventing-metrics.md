---
title: Kyma Eventing Metrics
---

Kyma Eventing provides several Grafana Dashboard with various [metrics](./evnt-02-eventing-metrics.md), so you can monitor statistics and other information in real time.
The metrics follow the [Prometheus naming convention](https://prometheus.io/docs/practices/naming/).

### Metrics Emitted by Eventing Publisher Proxy:

| Metric                                          | Description                                                                      |
| ----------------------------------------------- | :------------------------------------------------------------------------------- |
| **eventing_epp_backend_requests_total**         | The total number of backend requests                                             |
| **eventing_epp_event_type_published_total**     | The total number of events published for a given eventTypeLabel                  |
| **eventing_epp_requests_duration_milliseconds** | The duration of processing an incoming request (includes sending to the backend) |
| **eventing_epp_requests_total**                 | The total number of requests                                                     |
| **eventing_epp_backend_errors_total**           | The total number of backend errors while sending events to the messaging server  |
| **eventing_epp_backend_duration_milliseconds**  | The duration of sending events to the messaging server in milliseconds           |

### Metrics Emitted by Eventing Controller:

| Metric                                                    | Description                                                                                                                 |
| --------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------- |
| **eventing_ec_nats_delivery_per_subscription_total**      | The total number of dispatched events per subscription                                                                      |
| **eventing_ec_nats_subscriber_dispatch_duration_seconds** | The duration of sending an incoming NATS message to the subscriber (not including processing the message in the dispatcher) |
| **eventing_ec_event_type_subscribed_total**               | The total number of eventTypes subscribed using the Subscription CRD                                                        |

### Metrics Emitted by NATS Exporter:

The [Prometheus NATS Exporter](https://github.com/nats-io/prometheus-nats-exporter) also emits metrics that you can monitor. Learn more about [NATS Monitoring](https://docs.nats.io/running-a-nats-service/configuration/monitoring#jetstream-information).
