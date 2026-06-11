// Sample run data for the tfops Plan report — real output from run-0031.
window.RUN = {
  command: "plan",
  runId: "run-0031",
  repo: "terraform-up-and-running",
  branch: "master",
  startedAt: "2026-06-07T00:12:20Z",
  duration: "27s",
  results: [
    {
      env: "s3",
      profile: "default",
      failed: false,
      noChanges: false,
      add: 5, change: 0, destroy: 0,
      output: `Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
  + create

Terraform will perform the following actions:

  # aws_dynamodb_table.terraform_locks will be created
  + resource "aws_dynamodb_table" "terraform_locks" {
      + arn              = (known after apply)
      + billing_mode     = "PAY_PER_REQUEST"
      + hash_key         = "LockID"
      + id               = (known after apply)
      + name             = "terraform-up-and-running-locks"
      + read_capacity    = (known after apply)
      + stream_arn       = (known after apply)
      + stream_label     = (known after apply)
      + stream_view_type = (known after apply)
      + tags_all         = (known after apply)
      + write_capacity   = (known after apply)

      + attribute {
          + name = "LockID"
          + type = "S"
        }

      + point_in_time_recovery (known after apply)

      + server_side_encryption (known after apply)

      + ttl (known after apply)
    }

  # aws_s3_bucket.terraform_state will be created
  + resource "aws_s3_bucket" "terraform_state" {
      + acceleration_status         = (known after apply)
      + acl                         = (known after apply)
      + arn                         = (known after apply)
      + bucket                      = "terraform-up-and-running-state-andres"
      + bucket_domain_name          = (known after apply)
      + bucket_prefix               = (known after apply)
      + bucket_regional_domain_name = (known after apply)
      + force_destroy               = true
      + hosted_zone_id              = (known after apply)
      + id                          = (known after apply)
      + object_lock_enabled         = (known after apply)
      + policy                      = (known after apply)
      + region                      = (known after apply)
      + request_payer               = (known after apply)
      + tags_all                    = (known after apply)
      + website_domain              = (known after apply)
      + website_endpoint            = (known after apply)

      + versioning (known after apply)

      + website (known after apply)
    }

  # aws_s3_bucket_public_access_block.public_access will be created
  + resource "aws_s3_bucket_public_access_block" "public_access" {
      + block_public_acls       = true
      + block_public_policy     = true
      + bucket                  = (known after apply)
      + id                      = (known after apply)
      + ignore_public_acls      = true
      + restrict_public_buckets = true
    }

  # aws_s3_bucket_server_side_encryption_configuration.default will be created
  + resource "aws_s3_bucket_server_side_encryption_configuration" "default" {
      + bucket = (known after apply)
      + id     = (known after apply)

      + rule {
          + apply_server_side_encryption_by_default {
              + sse_algorithm     = "AES256"
                # (1 unchanged attribute hidden)
            }
        }
    }

  # aws_s3_bucket_versioning.enabled will be created
  + resource "aws_s3_bucket_versioning" "enabled" {
      + bucket = (known after apply)
      + id     = (known after apply)

      + versioning_configuration {
          + mfa_delete = (known after apply)
          + status     = "Enabled"
        }
    }

Plan: 5 to add, 0 to change, 0 to destroy.

Changes to Outputs:
  + dynamodb_table_name = "terraform-up-and-running-locks"
  + s3_bucket_arn       = (known after apply)

─────────────────────────────────────────────────────────────────────────────

Note: You didn't use the -out option to save this plan, so Terraform can't
guarantee to take exactly these actions if you run "terraform apply" now.`
    },
    {
      env: "example-server",
      profile: "default",
      failed: false,
      noChanges: false,
      add: 1, change: 0, destroy: 0,
      output: `Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
  + create

Terraform will perform the following actions:

  # aws_instance.example will be created
  + resource "aws_instance" "example" {
      + ami                                  = "ami-0a72af05d27b49ccb"
      + arn                                  = (known after apply)
      + associate_public_ip_address          = (known after apply)
      + availability_zone                    = (known after apply)
      + instance_state                       = (known after apply)
      + instance_type                        = "t2.micro"
      + key_name                             = (known after apply)
      + monitoring                           = (known after apply)
      + private_ip                           = (known after apply)
      + public_dns                           = (known after apply)
      + public_ip                            = (known after apply)
      + region                               = "ap-southeast-1"
      + source_dest_check                    = true
      + subnet_id                            = (known after apply)
      + tags                                 = {
          + "Name" = "terraform-example"
        }
      + tags_all                             = {
          + "Name" = "terraform-example"
        }
      + tenancy                              = (known after apply)
      + vpc_security_group_ids               = (known after apply)

      + metadata_options (known after apply)

      + root_block_device (known after apply)
    }

Plan: 1 to add, 0 to change, 0 to destroy.

─────────────────────────────────────────────────────────────────────────────

Note: You didn't use the -out option to save this plan, so Terraform can't
guarantee to take exactly these actions if you run "terraform apply" now.`
    },
    {
      env: "single-web-server",
      profile: "default",
      failed: false,
      noChanges: false,
      add: 2, change: 0, destroy: 0,
      output: `Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
  + create

Terraform will perform the following actions:

  # aws_instance.webserver will be created
  + resource "aws_instance" "webserver" {
      + ami                                  = "ami-0a72af05d27b49ccb"
      + arn                                  = (known after apply)
      + instance_type                        = "m6i.large"
      + region                               = "ap-southeast-1"
      + source_dest_check                    = true
      + subnet_id                            = (known after apply)
      + tags                                 = {
          + "Name" = "one-webserver"
        }
      + tags_all                             = {
          + "Name" = "one-webserver"
        }
      + user_data                            = <<-EOT
            #!/bin/bash
            echo "Hello, World" > index.html
            nohup busybox httpd -f -p 8080 &
        EOT
      + user_data_replace_on_change          = true
      + vpc_security_group_ids               = (known after apply)

      + root_block_device (known after apply)
    }

  # aws_security_group.webserver will be created
  + resource "aws_security_group" "webserver" {
      + arn                    = (known after apply)
      + description            = "Allow web inbound traffic"
      + egress                 = [
          + {
              + cidr_blocks      = [
                  + "0.0.0.0/0",
                ]
              + from_port        = 0
              + protocol         = "-1"
              + to_port          = 0
            },
        ]
      + id                     = (known after apply)
      + ingress                = [
          + {
              + cidr_blocks      = [
                  + "0.0.0.0/0",
                ]
              + description      = "TLS from VPC"
              + from_port        = 8080
              + protocol         = "tcp"
              + to_port          = 8080
            },
        ]
      + name                   = "Allow web"
      + region                 = "ap-southeast-1"
      + tags                   = {
          + "Name" = "allow-web-traffic"
        }
      + tags_all               = {
          + "Name" = "allow-web-traffic"
        }
      + vpc_id                 = "vpc-0609a33f6b97b90cd"
    }

Plan: 2 to add, 0 to change, 0 to destroy.

Changes to Outputs:
  + public_dns = (known after apply)
  + public_ip  = (known after apply)

─────────────────────────────────────────────────────────────────────────────

Note: You didn't use the -out option to save this plan, so Terraform can't
guarantee to take exactly these actions if you run "terraform apply" now.`
    },
    {
      env: "webserver-cluster",
      profile: "default",
      failed: false,
      noChanges: false,
      add: 7, change: 0, destroy: 0,
      output: `data.aws_vpc.default: Reading...
data.aws_vpc.default: Read complete after 2s [id=vpc-0f95b57227e3622ac]
data.aws_subnets.default: Reading...
data.aws_subnets.default: Read complete after 0s [id=eu-west-2]

Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
  + create

Terraform will perform the following actions:

  # aws_autoscaling_group.webserver_asg will be created
  + resource "aws_autoscaling_group" "webserver_asg" {
      + arn                              = (known after apply)
      + force_delete                     = false
      + health_check_grace_period        = 300
      + health_check_type                = "ELB"
      + id                               = (known after apply)
      + max_size                         = 3
      + metrics_granularity              = "1Minute"
      + min_size                         = 3
      + region                           = "eu-west-2"
      + vpc_zone_identifier              = [
          + "subnet-0008ed3acedf85b8a",
          + "subnet-0043c29ca176f8788",
          + "subnet-007737770aa30b413",
        ]
      + wait_for_capacity_timeout        = "10m"

      + tag {
          + key                 = "Name"
          + propagate_at_launch = true
          + value               = "terraform-asg-webserver"
        }
    }

  # aws_launch_configuration.webserver_lc will be created
  + resource "aws_launch_configuration" "webserver_lc" {
      + arn                         = (known after apply)
      + enable_monitoring           = true
      + id                          = (known after apply)
      + image_id                    = "ami-0a72af05d27b49ccb"
      + instance_type               = "t2.micro"
      + region                      = "eu-west-2"
      + user_data                   = "f656cd9de8860addc5a82630adc18c1b3a4883e5"
    }

  # aws_lb.webserver_lb will be created
  + resource "aws_lb" "webserver_lb" {
      + arn                                = (known after apply)
      + dns_name                           = (known after apply)
      + enable_deletion_protection         = false
      + enable_http2                       = true
      + id                                 = (known after apply)
      + idle_timeout                       = 60
      + internal                           = (known after apply)
      + load_balancer_type                 = "application"
      + name                               = "terraform-asg-lb"
      + region                             = "eu-west-2"
      + subnets                            = [
          + "subnet-0008ed3acedf85b8a",
          + "subnet-0043c29ca176f8788",
          + "subnet-007737770aa30b413",
        ]
      + vpc_id                             = (known after apply)
    }

  # aws_lb_listener.http will be created
  + resource "aws_lb_listener" "http" {
      + arn               = (known after apply)
      + id                = (known after apply)
      + load_balancer_arn = (known after apply)
      + port              = 80
      + protocol          = "HTTP"
      + region            = "eu-west-2"

      + default_action {
          + type  = "fixed-response"

          + fixed_response {
              + content_type = "text/plain"
              + message_body = "404: page not found"
              + status_code  = "404"
            }
        }
    }

  # aws_lb_listener_rule.asg will be created
  + resource "aws_lb_listener_rule" "asg" {
      + arn          = (known after apply)
      + id           = (known after apply)
      + listener_arn = (known after apply)
      + priority     = 100
      + region       = "eu-west-2"

      + action {
          + target_group_arn = (known after apply)
          + type             = "forward"
        }

      + condition {
          + path_pattern {
              + values       = [
                  + "*",
                ]
            }
        }
    }

  # aws_lb_target_group.asg will be created
  + resource "aws_lb_target_group" "asg" {
      + arn                  = (known after apply)
      + deregistration_delay = "300"
      + id                   = (known after apply)
      + name                 = "terraform-asg-example"
      + port                 = 80
      + protocol             = "HTTP"
      + region               = "eu-west-2"
      + target_type          = "instance"
      + vpc_id               = "vpc-0f95b57227e3622ac"

      + health_check {
          + enabled             = true
          + healthy_threshold   = 2
          + interval            = 15
          + matcher             = "200"
          + path                = "/"
          + protocol            = "HTTP"
          + timeout             = 3
          + unhealthy_threshold = 2
        }
    }

  # aws_security_group.alb will be created
  + resource "aws_security_group" "alb" {
      + arn                    = (known after apply)
      + description            = "Managed by Terraform"
      + id                     = (known after apply)
      + name                   = "terraform-webserver-alb"
      + region                 = "eu-west-2"
      + vpc_id                 = (known after apply)
    }

Plan: 7 to add, 0 to change, 0 to destroy.

Changes to Outputs:
  + alb_dns_name = (known after apply)

─────────────────────────────────────────────────────────────────────────────

Note: You didn't use the -out option to save this plan, so Terraform can't
guarantee to take exactly these actions if you run "terraform apply" now.`
    }
  ]
};
